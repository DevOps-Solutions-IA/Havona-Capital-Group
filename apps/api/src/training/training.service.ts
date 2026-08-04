import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@havona/database';
import { PrismaService } from '../common/prisma.service';

const ROLEPLAY_RUBRIC = [
  'apertura',
  'descubrimiento',
  'preguntas',
  'escucha',
  'propuesta_valor',
  'objeciones',
  'siguiente_paso',
  'cumplimiento',
] as const;
const SCENARIOS: Record<string, { objective: string; difficulty: string }> = {
  objection_price: {
    objective: 'Explorar la objeción de precio sin confrontar ni presionar.',
    difficulty: 'INTERMEDIATE',
  },
  think_about_it: {
    objective: 'Aislar qué necesita evaluar el prospecto y acordar un próximo paso.',
    difficulty: 'INTERMEDIATE',
  },
  already_insured: {
    objective: 'Comprender la cobertura actual sin desacreditar a terceros.',
    difficulty: 'ADVANCED',
  },
  no_budget: {
    objective: 'Diagnosticar prioridad y capacidad sin manipulación.',
    difficulty: 'ADVANCED',
  },
};

@Injectable()
export class TrainingService {
  constructor(private readonly db: PrismaService) {}
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
                knowledgeDocument: { select: { id: true, title: true, status: true } },
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
  async attempt(assessmentId: string, answers: Record<string, unknown>, userId: string) {
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
    return this.db.trainingAttempt.create({
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
  }
  startRoleplay(scenarioKey: string, userId: string) {
    const scenario = SCENARIOS[scenarioKey];
    if (!scenario) throw new BadRequestException('TRAINING_SCENARIO_NOT_FOUND');
    return this.db.trainingRoleplay.create({
      data: {
        userId,
        scenarioKey,
        difficulty: scenario.difficulty,
        objective: scenario.objective,
        transcript: [],
        rubric: ROLEPLAY_RUBRIC.map((criterion) => ({ criterion, max: 5 })),
      },
    });
  }
  async evaluateRoleplay(
    id: string,
    transcript: Array<{ role: string; content: string }>,
    userId: string,
  ) {
    const roleplay = await this.db.trainingRoleplay.findFirst({
      where: { id, userId, status: 'ACTIVE' },
    });
    if (!roleplay) throw new NotFoundException('TRAINING_ROLEPLAY_NOT_FOUND');
    const consultant = transcript
      .filter((item) => item.role === 'CONSULTANT')
      .map((item) => item.content)
      .join(' ');
    const questions = (consultant.match(/\?/g) ?? []).length,
      length = consultant.length;
    const scores = ROLEPLAY_RUBRIC.map((criterion) => ({
      criterion,
      score:
        criterion === 'preguntas' || criterion === 'descubrimiento'
          ? Math.min(5, questions)
          : criterion === 'cumplimiento'
            ? /garantiz|rentabilidad segura|aprobación segura/i.test(consultant)
              ? 0
              : 5
            : Math.min(5, Math.max(1, Math.floor(length / 180))),
    }));
    const score = (scores.reduce((sum, item) => sum + item.score, 0) / (scores.length * 5)) * 100;
    return this.db.trainingRoleplay.update({
      where: { id },
      data: {
        transcript,
        score,
        status: 'COMPLETED',
        completedAt: new Date(),
        feedback: {
          strengths: scores.filter((item) => item.score >= 4),
          opportunities: scores.filter((item) => item.score < 4),
          evidence: {
            consultantTurns: transcript.filter((item) => item.role === 'CONSULTANT').length,
            questions,
          },
          disclaimer: 'Simulación formativa; no corresponde a un cliente ni a CRM.',
        },
      },
    });
  }
}
