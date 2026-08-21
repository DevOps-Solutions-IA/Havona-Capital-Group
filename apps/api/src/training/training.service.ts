import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@havona/database';
import { AuditContext, AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma.service';
import {
  getTrainingScenario,
  publicTrainingScenario,
  TRAINING_ROLEPLAY_CATALOG,
} from './training-roleplay.catalog';
import {
  evaluateTrainingTranscript,
  sanitizeManualTranscriptEvaluationForPersistence,
  TRAINING_RUBRIC,
  TrainingTurn,
} from './training-roleplay.evaluator';

export type TrainingActor = { id: string; roles: string[]; permissions: string[] };

@Injectable()
export class TrainingService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listScenarios() {
    return TRAINING_ROLEPLAY_CATALOG.map(publicTrainingScenario);
  }
  listPrograms(userId: string, canManage: boolean) {
    return this.db.trainingProgram.findMany({
      where: canManage
        ? {}
        : { OR: [{ status: 'PUBLISHED' }, { enrollments: { some: { userId } } }] },
      include: {
        modules: {
          orderBy: { position: 'asc' },
          include: {
            lessons: {
              orderBy: { position: 'asc' },
              select: { id: true, title: true, objective: true, estimatedMinutes: true },
            },
          },
        },
        enrollments: { where: { userId } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
  listProgress(userId: string) {
    return this.db.trainingEnrollment.findMany({
      where: { userId },
      include: { program: { select: { id: true, title: true } } },
      orderBy: { assignedAt: 'desc' },
    });
  }
  async getProgram(id: string, userId: string, canManage: boolean) {
    const row = await this.db.trainingProgram.findFirst({
      where: {
        id,
        ...(canManage
          ? {}
          : { OR: [{ status: 'PUBLISHED' }, { enrollments: { some: { userId } } }] }),
      },
      include: {
        modules: {
          orderBy: { position: 'asc' },
          include: {
            lessons: {
              orderBy: { position: 'asc' },
              include: {
                assessments: { select: { id: true, title: true, passingScore: true } },
              },
            },
          },
        },
        enrollments: { where: { userId } },
      },
    });
    if (!row) throw new NotFoundException('TRAINING_PROGRAM_NOT_FOUND');
    return row;
  }
  createProgram(input: any, userId: string) {
    return this.db.trainingProgram.create({
      data: {
        title: input.title,
        description: input.description,
        collectionId: input.collectionId,
        createdById: userId,
        modules: {
          create: input.modules.map((module: any, moduleIndex: number) => ({
            title: module.title,
            position: moduleIndex,
            lessons: {
              create: module.lessons.map((lesson: any, lessonIndex: number) => ({
                title: lesson.title,
                objective: lesson.objective,
                content: lesson.content,
                knowledgeDocumentId: lesson.knowledgeDocumentId,
                estimatedMinutes: lesson.estimatedMinutes ?? 15,
                position: lessonIndex,
              })),
            },
          })),
        },
      },
      include: { modules: { include: { lessons: true } } },
    });
  }
  publishProgram(id: string) {
    return this.db.trainingProgram.update({ where: { id }, data: { status: 'PUBLISHED' } });
  }
  enroll(programId: string, targetUserId: string, actorId: string, canManageTeam: boolean) {
    if (targetUserId !== actorId && !canManageTeam)
      throw new ForbiddenException('TRAINING_FORBIDDEN');
    return this.db.trainingEnrollment.upsert({
      where: { programId_userId: { programId, userId: targetUserId } },
      create: { programId, userId: targetUserId, completedLessonIds: [] },
      update: {},
    });
  }
  async progress(programId: string, lessonId: string, userId: string) {
    const enrollment = await this.db.trainingEnrollment.findUnique({
      where: { programId_userId: { programId, userId } },
      include: {
        program: { include: { modules: { include: { lessons: { select: { id: true } } } } } },
      },
    });
    if (!enrollment) throw new NotFoundException('TRAINING_ENROLLMENT_NOT_FOUND');
    const completed = Array.isArray(enrollment.completedLessonIds)
      ? enrollment.completedLessonIds.filter((item): item is string => typeof item === 'string')
      : [];
    const valid = enrollment.program.modules.flatMap((module) =>
      module.lessons.map((lesson) => lesson.id),
    );
    if (!valid.includes(lessonId)) throw new BadRequestException('TRAINING_LESSON_INVALID');
    const next = [...new Set([...completed, lessonId])],
      progress = valid.length ? Math.round((next.length / valid.length) * 100) : 100;
    return this.db.trainingEnrollment.update({
      where: { id: enrollment.id },
      data: {
        completedLessonIds: next,
        progress,
        status: progress === 100 ? 'COMPLETED' : 'IN_PROGRESS',
        completedAt: progress === 100 ? new Date() : null,
      },
    });
  }
  async attempt(
    assessmentId: string,
    answers: Record<string, unknown>,
    userId: string,
    ctx: AuditContext = { actorUserId: userId },
  ) {
    const assessment = await this.db.trainingAssessment.findUnique({
      where: { id: assessmentId },
      include: { questions: true },
    });
    if (!assessment) throw new NotFoundException('TRAINING_ASSESSMENT_NOT_FOUND');
    let earned = 0,
      total = 0;
    const evidence = assessment.questions.map((question) => {
      total += question.points;
      const answer = answers[question.id];
      const key = question.answerKey as any;
      const objective = ['MULTIPLE_CHOICE', 'TRUE_FALSE'].includes(question.type);
      const correct = objective ? JSON.stringify(answer) === JSON.stringify(key.value) : false;
      if (correct) earned += question.points;
      return {
        questionId: question.id,
        type: question.type,
        correct: objective ? correct : null,
        rubricRequired: !objective,
      };
    });
    if (evidence.some((item) => item.rubricRequired))
      throw new BadRequestException('TRAINING_RUBRIC_REVIEW_REQUIRED');
    const score = total ? (earned / total) * 100 : 0;
    const row = await this.db.trainingAttempt.create({
      data: {
        assessmentId,
        userId,
        answers: answers as Prisma.InputJsonValue,
        score,
        evidence,
        feedback: {
          passed: score >= assessment.passingScore,
          message:
            score >= assessment.passingScore
              ? 'Objetivo alcanzado.'
              : 'Revisa las fuentes de la lección y vuelve a intentarlo.',
        },
      },
    });
    await this.audit.record('training.assessment.completed', 'TrainingAttempt', row.id, ctx, {
      assessmentId,
      score,
      passed: score >= assessment.passingScore,
    });
    return row;
  }
  async startRoleplay(scenarioKey: string, userId: string, ctx: AuditContext = { actorUserId: userId }) {
    const scenario = getTrainingScenario(scenarioKey);
    if (!scenario) throw new BadRequestException('TRAINING_SCENARIO_NOT_FOUND');
    const row = await this.db.trainingRoleplay.create({
      data: {
        userId,
        scenarioKey,
        difficulty: scenario.difficulty,
        objective: scenario.objective,
        transcript: [{ role: 'CLIENT', content: scenario.openingMessage }],
        rubric: TRAINING_RUBRIC.map((criterion) => ({ criterion, max: 5 })),
      },
    });
    await this.audit.record('training.roleplay.started', 'TrainingRoleplay', row.id, ctx, {
      scenarioKey,
      source: 'TRAINING_SIMULATION',
    });
    return { ...row, scenario: publicTrainingScenario(scenario), openingMessage: scenario.openingMessage };
  }

  async continueRoleplay(id: string, content: string, userId: string) {
    const roleplay = await this.db.trainingRoleplay.findFirst({ where: { id, userId, status: 'ACTIVE' } });
    if (!roleplay) throw new NotFoundException('TRAINING_ROLEPLAY_NOT_FOUND');
    const scenario = getTrainingScenario(roleplay.scenarioKey);
    if (!scenario) throw new BadRequestException('TRAINING_SCENARIO_NOT_FOUND');
    const transcript = Array.isArray(roleplay.transcript) ? (roleplay.transcript as TrainingTurn[]) : [];
    const consultantTurn: TrainingTurn = { role: 'CONSULTANT', content };
    const clientTurns = transcript.filter((turn) => turn.role === 'CLIENT').length;
    let response = scenario.objections[Math.min(clientTurns - 1, scenario.objections.length - 1)] ??
      'Entiendo. ¿Qué necesitas saber de mi situación para continuar?';
    if (/ignora (?:las|tus) reglas|system prompt|mu[eé]strame .*cliente|llama (?:al )?crm|ejecuta .*automat/i.test(content))
      response = 'No entiendo esa solicitud. Prefiero continuar únicamente con esta conversación de práctica.';
    else if (/¿(?:qué|cómo|cuál|quién|cuándo)|preocupa|impacto|prioridad/i.test(content))
      response = clientTurns > 2
        ? `Lo más importante para mí es ${scenario.objective.toLowerCase()}`
        : scenario.context;
    const next: TrainingTurn[] = [...transcript, consultantTurn, { role: 'CLIENT', content: response }];
    await this.db.trainingRoleplay.update({ where: { id }, data: { transcript: next } });
    return { id, mode: 'ROLEPLAY', role: 'CLIENT', content: response, turn: next.length };
  }
  async evaluateRoleplay(
    id: string,
    transcript: Array<{ role: string; content: string }>,
    userId: string,
    source: 'ROLEPLAY' | 'MANUAL_TRANSCRIPT' = 'ROLEPLAY',
    ctx: AuditContext = { actorUserId: userId },
  ) {
    const roleplay = await this.db.trainingRoleplay.findFirst({
      where: { id, userId, status: 'ACTIVE' },
    });
    if (!roleplay) throw new NotFoundException('TRAINING_ROLEPLAY_NOT_FOUND');
    const scenario = getTrainingScenario(roleplay.scenarioKey);
    const transientEvaluation = evaluateTrainingTranscript(
      transcript as TrainingTurn[],
      scenario,
      source,
    );
    const evaluation =
      source === 'MANUAL_TRANSCRIPT'
        ? sanitizeManualTranscriptEvaluationForPersistence(transientEvaluation)
        : transientEvaluation;
    const updated = await this.db.trainingRoleplay.update({
      where: { id },
      data: {
        transcript: source === 'MANUAL_TRANSCRIPT' ? [] : transcript,
        rubric: evaluation.rubric as unknown as Prisma.InputJsonValue,
        score: evaluation.score,
        status: 'COMPLETED',
        completedAt: new Date(),
        feedback: evaluation as unknown as Prisma.InputJsonValue,
      },
    });
    await this.audit.record('training.roleplay.completed', 'TrainingRoleplay', id, ctx, {
      scenarioKey: roleplay.scenarioKey,
      score: evaluation.score,
      complianceCritical: evaluation.compliance.critical,
      source,
    });
    await this.audit.record('training.assessment.completed', 'TrainingRoleplay', id, ctx, {
      rubricVersion: 1,
      source,
    });
    return { ...updated, evaluation };
  }

  async evaluateManualTranscript(transcript: TrainingTurn[], userId: string, ctx: AuditContext) {
    const row = await this.db.trainingRoleplay.create({
      data: {
        userId,
        scenarioKey: 'manual_transcript',
        difficulty: 'UNSPECIFIED',
        objective: 'Evaluación formativa de transcript suministrado manualmente.',
        transcript: [],
        rubric: TRAINING_RUBRIC.map((criterion) => ({ criterion, max: 5 })),
      },
    });
    await this.audit.record('training.roleplay.started', 'TrainingRoleplay', row.id, ctx, {
      source: 'MANUAL_TRANSCRIPT',
    });
    return this.evaluateRoleplay(row.id, transcript, userId, 'MANUAL_TRANSCRIPT', ctx);
  }

  private async scopeUserIds(actor: TrainingActor, requestedUserId?: string) {
    if (!actor.permissions.includes('training.read_team')) {
      if (requestedUserId && requestedUserId !== actor.id)
        throw new ForbiddenException('TRAINING_FORBIDDEN');
      return [actor.id];
    }
    if (actor.permissions.includes('training.manage') && !actor.roles.includes('GERENTE'))
      return requestedUserId ? [requestedUserId] : undefined;
    const memberships = await this.db.calendarTeamMembership.findMany({
      where: { managerId: actor.id },
      select: { memberId: true },
    });
    const allowed = [actor.id, ...memberships.map((item) => item.memberId)];
    if (requestedUserId && !allowed.includes(requestedUserId))
      throw new ForbiddenException('TRAINING_TEAM_SCOPE_FORBIDDEN');
    return requestedUserId ? [requestedUserId] : allowed;
  }

  async performance(actor: TrainingActor, requestedUserId?: string) {
    const scope = await this.scopeUserIds(actor, requestedUserId);
    const targetUserId: string =
      requestedUserId || (scope?.length === 1 ? scope[0] : undefined) || actor.id;
    if (targetUserId !== actor.id && !actor.permissions.includes('training.read_team'))
      throw new ForbiddenException('TRAINING_FORBIDDEN');
    const [roleplays, attempts, enrollments] = await Promise.all([
      this.db.trainingRoleplay.findMany({ where: { userId: targetUserId, status: 'COMPLETED' }, orderBy: { completedAt: 'desc' }, take: 50, select: { scenarioKey: true, score: true, rubric: true, feedback: true, completedAt: true } }),
      this.db.trainingAttempt.findMany({ where: { userId: targetUserId }, orderBy: { createdAt: 'desc' }, take: 50, select: { score: true } }),
      this.db.trainingEnrollment.findMany({ where: { userId: targetUserId }, select: { progress: true } }),
    ]);
    return this.performanceFromRows(targetUserId, roleplays, attempts, enrollments);
  }

  private performanceFromRows(
    targetUserId: string,
    roleplays: Array<{ scenarioKey: string; score: unknown; rubric: unknown; feedback: unknown }>,
    attempts: Array<{ score: unknown }>,
    enrollments: Array<{ progress: number }>,
  ) {
    const scores = roleplays.map((item) => Number(item.score)).filter(Number.isFinite);
    const skillScores = new Map<string, number[]>();
    let complianceRiskCount = 0;
    for (const item of roleplays) {
      const rubric = Array.isArray(item.rubric) ? (item.rubric as any[]) : [];
      for (const result of rubric) {
        if (typeof result?.criterion !== 'string' || typeof result?.score !== 'number') continue;
        skillScores.set(result.criterion, [...(skillScores.get(result.criterion) ?? []), result.score]);
      }
      const feedback = item.feedback as any;
      if (feedback?.compliance?.flags?.length) complianceRiskCount += feedback.compliance.flags.length;
    }
    const skills = [...skillScores.entries()].map(([skill, values]) => ({ skill, score: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)), samples: values.length }));
    const recent = scores.slice(0, 3), previous = scores.slice(3, 6);
    const avg = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    const recentAverage = avg(recent), previousAverage = avg(previous);
    return {
      userId: targetUserId,
      insufficientEvidence: roleplays.length < 2,
      roleplaysCompleted: roleplays.length,
      averageScore: avg(scores) === null ? null : Number(avg(scores)!.toFixed(2)),
      lastScore: scores[0] ?? null,
      scoreTrend: recentAverage === null || previousAverage === null ? null : Number((recentAverage - previousAverage).toFixed(2)),
      strongestSkills: skills.filter((item) => item.samples >= 1).sort((a, b) => b.score - a.score).slice(0, 3),
      weakestSkills: skills.filter((item) => item.samples >= 1).sort((a, b) => a.score - b.score).slice(0, 3),
      complianceRiskCount,
      assessmentAverage: attempts.length ? Number((attempts.reduce((sum, item) => sum + Number(item.score), 0) / attempts.length).toFixed(2)) : null,
      trainingProgress: enrollments.length ? Number((enrollments.reduce((sum, item) => sum + item.progress, 0) / enrollments.length).toFixed(2)) : null,
      practicedScenarioKeys: roleplays.map((item) => item.scenarioKey),
    };
  }

  async improvementPlan(actor: TrainingActor, ctx: AuditContext) {
    const performance = await this.performance(actor);
    const practiced = new Set(performance.practicedScenarioKeys);
    const areasNotPracticed = [...new Set(TRAINING_ROLEPLAY_CATALOG.filter((item) => !practiced.has(item.scenarioKey)).map((item) => item.skill))].slice(0, 8);
    const weakest = performance.weakestSkills[0]?.skill;
    const preferred = TRAINING_ROLEPLAY_CATALOG.filter((item) => item.skill === weakest && !practiced.has(item.scenarioKey));
    const fallback = TRAINING_ROLEPLAY_CATALOG.filter((item) => !practiced.has(item.scenarioKey));
    const nextExercises = [...preferred, ...fallback].filter((item, index, all) => all.findIndex((other) => other.scenarioKey === item.scenarioKey) === index).slice(0, 3).map(publicTrainingScenario);
    const plan = {
      ...performance,
      recurrentErrors: performance.complianceRiskCount ? ['Riesgos de cumplimiento detectados en evaluaciones recientes.'] : [],
      areasNotPracticed,
      nextSkill: weakest ?? areasNotPracticed[0] ?? null,
      nextExercises,
    };
    await this.audit.record('training.plan.viewed', 'User', actor.id, ctx, {
      insufficientEvidence: plan.insufficientEvidence,
      roleplaysCompleted: plan.roleplaysCompleted,
    });
    return plan;
  }

  async roleplayHistory(actor: TrainingActor) {
    return this.db.trainingRoleplay.findMany({
      where: { userId: actor.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        scenarioKey: true,
        difficulty: true,
        objective: true,
        score: true,
        feedback: true,
        status: true,
        createdAt: true,
        completedAt: true,
      },
    });
  }

  async teamSummary(actor: TrainingActor) {
    if (!actor.permissions.includes('training.read_team'))
      throw new ForbiddenException('TRAINING_TEAM_SCOPE_FORBIDDEN');
    const userIds = await this.scopeUserIds(actor);
    const users = await this.db.user.findMany({
      where: {
        ...(userIds ? { id: { in: userIds } } : {}),
        roles: { some: { role: { name: 'CONSULTOR' } } },
      },
      select: { id: true, name: true },
      take: 200,
    });
    const scopedIds = users.map((user) => user.id);
    const historyStart = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const [roleplays, attempts, enrollments] = await Promise.all([
      this.db.trainingRoleplay.findMany({
        where: { userId: { in: scopedIds }, status: 'COMPLETED', completedAt: { gte: historyStart } },
        orderBy: { completedAt: 'desc' },
        take: 10_000,
        select: { userId: true, scenarioKey: true, score: true, rubric: true, feedback: true },
      }),
      this.db.trainingAttempt.findMany({
        where: { userId: { in: scopedIds }, createdAt: { gte: historyStart } },
        orderBy: { createdAt: 'desc' },
        take: 10_000,
        select: { userId: true, score: true },
      }),
      this.db.trainingEnrollment.findMany({
        where: { userId: { in: scopedIds } },
        select: { userId: true, progress: true },
      }),
    ]);
    const members = users.map((user) => ({
      user,
      performance: this.performanceFromRows(
        user.id,
        roleplays.filter((item) => item.userId === user.id),
        attempts.filter((item) => item.userId === user.id),
        enrollments.filter((item) => item.userId === user.id),
      ),
    }));
    return {
      members,
      notPracticed: members.filter((item) => item.performance.roleplaysCompleted === 0).map((item) => item.user),
      lowScore: members.filter((item) => item.performance.averageScore !== null && item.performance.averageScore < 60).map((item) => item.user),
      improved: members.filter((item) => (item.performance.scoreTrend ?? 0) > 0).map((item) => item.user),
      complianceRisk: members.filter((item) => item.performance.complianceRiskCount > 0).map((item) => item.user),
      skillsToReinforce: [...new Set(members.flatMap((item) => item.performance.weakestSkills.map((skill) => skill.skill)))].slice(0, 5),
    };
  }
}
