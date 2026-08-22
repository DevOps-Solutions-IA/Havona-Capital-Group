import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { constantTimeTokenMatch, createOpaqueToken, hashToken } from '@havona/auth';
import {
  CreateHenryConversationInput,
  HenryConversationListInput,
  HenryPageContextInput,
  SendHenryMessageInput,
} from '@havona/contracts';
import { AIExecutionStatus, Conversation, Prisma } from '@havona/database';
import { AIConfig } from '../ai/ai-config';
import { AIMessage, AIProvider, AIProviderError, AI_PROVIDER } from '../ai/ai-provider';
import { Inject } from '@nestjs/common';
import { AuditContext, AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma.service';
import { HenryToolsService } from './henry-tools.service';
import { HenryPolicyComposer } from './policies/henry-policy-composer.service';
import { HenryPolicyEngine } from './policies/henry-policy-engine.service';
import {
  HENRY_MANUAL_VERSION,
  HenryConversationStage,
  HenryPolicyDecision,
} from './policies/henry-policy.types';
import { HenryActor, HenryContextService } from './henry-context.service';
import { HenryCorporateMemory, HenryExpertCopilotService } from './henry-expert-copilot.service';
import { HenryContextAssembler } from './henry-context-assembler.service';
import { HenryMemoryService } from '../knowledge/memory.service';
import { HenryPaligConsultativeService } from './henry-palig-consultative.service';
import {
  HenryCommercialBehaviorService,
  type HenryCommercialMemory,
} from './henry-commercial-behavior.service';

type Actor = { id: string; permissions: string[] };

@Injectable()
export class HenryService {
  constructor(
    private readonly db: PrismaService,
    @Inject(AI_PROVIDER) private readonly provider: AIProvider,
    private readonly config: AIConfig,
    private readonly tools: HenryToolsService,
    private readonly audit: AuditService,
    private readonly policyComposer: HenryPolicyComposer,
    private readonly policyEngine: HenryPolicyEngine,
    private readonly henryContext: HenryContextService,
    private readonly expertCopilot: HenryExpertCopilotService,
    private readonly contextAssembler: HenryContextAssembler,
    private readonly persistentMemory: HenryMemoryService,
    private readonly paligConsultative: HenryPaligConsultativeService,
    private readonly commercialBehavior: HenryCommercialBehaviorService,
  ) {}

  async reasonForAutomation(input: {
    objective: string;
    context: Record<string, unknown>;
    actor: HenryActor;
  }) {
    if (!input.objective.trim())
      throw new BadRequestException('Objetivo de razonamiento requerido');
    const result = await this.provider.complete({
      messages: [
        {
          role: 'system',
          content:
            'Actúas dentro de Henry Core de HAVONA CAPITAL GROUP. Analiza únicamente el contexto autorizado. No ejecutes acciones ni proveedores. Devuelve JSON válido con las claves summary, classification, confidence y recommendedNextStep. No inventes datos ausentes.',
        },
        {
          role: 'user',
          content: JSON.stringify({ objective: input.objective, context: input.context }),
        },
      ],
      tools: [],
      maxOutputTokens: Math.min(this.config.maxOutputTokens, 600),
      temperature: 0,
    });
    let structured: unknown;
    try {
      structured = JSON.parse(result.content ?? '{}');
    } catch {
      throw new AIProviderError(
        'AI_OUTPUT_INVALID',
        'Henry no devolvió un resultado estructurado',
        false,
      );
    }
    return {
      structured,
      provider: result.provider,
      model: result.model,
      usage: result.usage,
      policyId: 'henry-automation-reasoning',
      ruleId: 'HENRY-AUTOMATION-NO-EXECUTE-001',
    };
  }

  async create(input: CreateHenryConversationInput, context: AuditContext, actor?: HenryActor) {
    return this.createOnChannel(input, context, actor, 'WEB');
  }

  async createVoiceGatewayConversation(input: CreateHenryConversationInput, context: AuditContext) {
    const result = await this.createOnChannel(input, context, undefined, 'VOICE');
    const conversation = await this.authorize(result.data.id, result.data.accessToken);
    return { result, conversation };
  }

  private async createOnChannel(
    input: CreateHenryConversationInput,
    context: AuditContext,
    actor: HenryActor | undefined,
    channel: 'WEB' | 'VOICE',
  ) {
    const resolved = await this.henryContext.resolve(input.pageContext, actor);
    const token = createOpaqueToken(32);
    const created = await this.db.$transaction(async (tx) => {
      const conversation = await tx.conversation.create({
        data: {
          accessTokenHash: hashToken(token),
          channel,
          consentAcceptedAt: new Date(),
          privacyVersion: input.consent.privacyVersion,
          prospectId: resolved.entity?.type === 'prospect' ? resolved.entity.id : undefined,
          state: {
            create: {
              state: {
                entryPoint: input.entryPoint,
                confirmedFields: [],
                stage: 'GREETING',
                manualVersion: HENRY_MANUAL_VERSION,
                roleContext: resolved.role,
                pageContext: resolved.page,
                contextId: `${resolved.page.pageType}:${resolved.page.section ?? 'root'}`,
                workingMemory: { objective: '', intention: null, knownReferences: [] },
                longTermMemoryReference: [],
                draft: null,
                lastIntention: null,
                lastObjective: '',
              },
            },
          },
        },
      });
      const [visitor, assistant] = await Promise.all([
        tx.conversationParticipant.create({
          data: { conversationId: conversation.id, type: 'VISITOR' },
        }),
        tx.conversationParticipant.create({
          data: { conversationId: conversation.id, type: 'ASSISTANT', displayName: 'Henry' },
        }),
      ]);
      if (actor)
        await tx.conversationParticipant.create({
          data: {
            conversationId: conversation.id,
            type: 'USER',
            userId: actor.id,
            displayName: resolved.role,
          },
        });
      const greeting = await tx.message.create({
        data: {
          conversationId: conversation.id,
          participantId: assistant.id,
          role: 'ASSISTANT',
          status: 'COMPLETED',
          channel,
          origin: 'SYSTEM_GREETING',
          content:
            'Soy Henry, asistente virtual de HAVONA CAPITAL GROUP. Puedo ayudarle a identificar su necesidad y facilitar una conversación con nuestro equipo. ¿Qué le gustaría resolver hoy?',
        },
      });
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: greeting.createdAt },
      });
      await this.audit.record(
        'HENRY_CONVERSATION_CREATED',
        'Conversation',
        conversation.id,
        { ...context, actorUserId: actor?.id },
        { channel, entryPoint: input.entryPoint, role: resolved.role, pageContext: resolved.page },
        tx,
      );
      return { conversation, visitor, greeting };
    });
    return {
      data: {
        id: created.conversation.publicId,
        accessToken: token,
        status: created.conversation.status,
        providerConfigured: this.provider.isConfigured(),
        messages: [this.publicMessage(created.greeting)],
      },
    };
  }

  async get(publicId: string, token: string | undefined, actor?: HenryActor) {
    const conversation = await this.authorize(publicId, token);
    if (actor) await this.authorizeInternalParticipant(conversation.id, actor.id);
    const messages = await this.db.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return {
      data: {
        id: conversation.publicId,
        status: conversation.status,
        intention: conversation.intention,
        prospectAssociated: Boolean(conversation.prospectId),
        messages: messages.map((message) => this.publicMessage(message)),
      },
    };
  }

  async send(
    publicId: string,
    token: string | undefined,
    input: SendHenryMessageInput,
    context: AuditContext,
    actor?: HenryActor,
  ) {
    return this.sendOnChannel(publicId, token, input, context, actor, 'WEB');
  }

  async sendVoice(
    publicId: string,
    token: string | undefined,
    input: SendHenryMessageInput,
    context: AuditContext,
    actor?: HenryActor,
  ) {
    return this.sendOnChannel(publicId, token, input, context, actor, 'VOICE');
  }

  async resolveAuthorizedConversation(
    publicId: string,
    token: string | undefined,
    actor?: HenryActor,
  ) {
    const conversation = await this.authorize(publicId, token);
    if (actor) await this.authorizeInternalParticipant(conversation.id, actor.id);
    return conversation;
  }

  resolveRuntimeContext(pageContext?: HenryPageContextInput, actor?: HenryActor) {
    return this.henryContext.resolve(pageContext, actor);
  }

  async getAuthorizedAssistantMessage(
    publicId: string,
    token: string | undefined,
    messageId: string,
    actor?: HenryActor,
  ) {
    const conversation = await this.resolveAuthorizedConversation(publicId, token, actor);
    const message = await this.db.message.findFirst({
      where: {
        id: messageId,
        conversationId: conversation.id,
        role: 'ASSISTANT',
        status: 'COMPLETED',
      },
    });
    if (!message) throw new NotFoundException('Respuesta de Henry no encontrada');
    return { conversation, message };
  }

  private async sendOnChannel(
    publicId: string,
    token: string | undefined,
    input: SendHenryMessageInput,
    context: AuditContext,
    actor: HenryActor | undefined,
    channel: 'WEB' | 'VOICE',
  ) {
    const conversation = await this.authorize(publicId, token);
    if (actor) await this.authorizeInternalParticipant(conversation.id, actor.id);
    return this.processAuthorizedMessage(conversation, input, context, actor, channel);
  }

  async sendTrustedGatewayVoice(
    conversationId: string,
    input: SendHenryMessageInput,
    context: AuditContext,
  ) {
    const conversation = await this.db.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    if (conversation.channel !== 'VOICE')
      throw new BadRequestException('El gateway solo puede usar conversaciones de voz');
    return this.processAuthorizedMessage(conversation, input, context, undefined, 'VOICE');
  }

  private async processAuthorizedMessage(
    conversation: Conversation,
    input: SendHenryMessageInput,
    context: AuditContext,
    actor: HenryActor | undefined,
    channel: 'WEB' | 'VOICE',
  ) {
    const resolved = await this.henryContext.resolve(input.pageContext, actor);
    await this.updateRuntimeContext(conversation.id, resolved.role, resolved.page);
    if (conversation.status === 'CLOSED' || conversation.status === 'BLOCKED')
      throw new BadRequestException('La conversación no acepta nuevos mensajes');
    const existing = await this.db.message.findUnique({ where: { id: input.messageId } });
    if (existing) {
      if (existing.conversationId !== conversation.id)
        throw new BadRequestException('Identificador de mensaje inválido');
      return this.responseForInput(existing.id, conversation.id);
    }
    const visitor = await this.db.conversationParticipant.findFirstOrThrow({
      where: {
        conversationId: conversation.id,
        type: actor ? 'USER' : { in: ['VISITOR', 'PROSPECT'] },
        ...(actor ? { userId: actor.id } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    const userMessage = await this.db.message.create({
      data: {
        id: input.messageId,
        conversationId: conversation.id,
        participantId: visitor.id,
        role: 'USER',
        status: 'PROCESSING',
        content: input.content,
        channel,
        origin:
          channel === 'VOICE'
            ? actor
              ? 'VOICE_INTERNAL'
              : 'VOICE_VISITOR'
            : actor
              ? 'WEB_INTERNAL'
              : 'WEB_VISITOR',
        metadata: {
          roleContext: resolved.role,
          pageContext: resolved.page,
          entityContext: resolved.entity
            ? { type: resolved.entity.type, id: resolved.entity.id }
            : undefined,
        },
      },
    });
    await this.db.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: userMessage.createdAt },
    });
    return this.orchestrate(
      conversation.id,
      userMessage.id,
      { ...context, actorUserId: actor?.id },
      resolved,
      channel,
      actor,
    );
  }

  async requestEscalation(
    publicId: string,
    token: string | undefined,
    reason: any,
    summary: string,
    context: AuditContext,
  ) {
    const conversation = await this.authorize(publicId, token);
    const decision: HenryPolicyDecision = {
      action: 'ESCALATE',
      policyId: 'escalation',
      ruleId: 'ESC-HUMAN-ENDPOINT-001',
      reason,
      stage: 'ESCALATION',
    };
    const state = await this.db.conversationState.findUnique({
      where: { conversationId: conversation.id },
    });
    const currentStage = this.readStage(state?.state);
    if (currentStage !== 'ESCALATION')
      await this.transitionState(conversation.id, currentStage, 'ESCALATION', decision, context);
    const result = await this.tools.escalate(reason, summary, {
      conversationId: conversation.id,
      audit: context,
      decision,
    });
    return { data: result };
  }

  async list(query: HenryConversationListInput, actor: Actor) {
    const where = this.adminScope(actor, {
      status: query.status,
      channel: query.channel,
      escalations:
        query.escalated === undefined ? undefined : query.escalated ? { some: {} } : { none: {} },
      OR: query.search
        ? [
            { intention: { contains: query.search, mode: 'insensitive' } },
            { prospect: { name: { contains: query.search, mode: 'insensitive' } } },
            { prospect: { email: { contains: query.search, mode: 'insensitive' } } },
          ]
        : undefined,
    });
    const [data, total] = await this.db.$transaction([
      this.db.conversation.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          prospect: { select: { id: true, name: true, email: true } },
          escalations: {
            where: { status: { in: ['OPEN', 'ASSIGNED'] } },
            select: { id: true, reason: true, status: true },
            take: 1,
          },
          _count: { select: { messages: true, executions: true } },
        },
      }),
      this.db.conversation.count({ where }),
    ]);
    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async detail(id: string, actor: Actor, context: AuditContext) {
    const conversation = await this.db.conversation.findFirst({
      where: this.adminScope(actor, { id }),
      include: {
        prospect: {
          select: { id: true, name: true, email: true, phone: true, city: true, interest: true },
        },
        messages: { orderBy: { createdAt: 'asc' } },
        executions: {
          orderBy: { startedAt: 'desc' },
          include: { usage: true, toolCalls: { include: { result: true } } },
        },
        escalations: {
          orderBy: { createdAt: 'desc' },
          include: { assignedTo: { select: { id: true, name: true } } },
        },
      },
    });
    if (!conversation)
      throw new NotFoundException('Conversación no encontrada o fuera de su ámbito');
    await this.audit.record('HENRY_CONVERSATION_VIEWED', 'Conversation', id, context);
    return conversation;
  }

  async dashboard(actor: Actor) {
    const where = this.adminScope(actor, {});
    const executionWhere: Prisma.AIExecutionWhereInput = { conversation: where };
    const [conversations, escalated, prospectLinked, toolCalls, errors, usage] =
      await this.db.$transaction([
        this.db.conversation.count({ where }),
        this.db.conversation.count({ where: { ...where, escalations: { some: {} } } }),
        this.db.conversation.count({ where: { ...where, prospectId: { not: null } } }),
        this.db.toolCall.count({ where: { execution: executionWhere } }),
        this.db.aIExecution.count({ where: { ...executionWhere, status: 'FAILED' } }),
        this.db.aIUsage.aggregate({
          where: { execution: executionWhere },
          _sum: {
            inputTokens: true,
            outputTokens: true,
            totalTokens: true,
            estimatedCostUsd: true,
          },
        }),
      ]);
    return {
      conversations,
      escalated,
      prospectLinked,
      toolCalls,
      errors,
      usage: usage._sum,
      generatedAt: new Date().toISOString(),
    };
  }

  private async orchestrate(
    conversationId: string,
    inputMessageId: string,
    context: AuditContext,
    runtimeContext: Awaited<ReturnType<HenryContextService['resolve']>>,
    channel: 'WEB' | 'VOICE' = 'WEB',
    actor?: Actor,
  ) {
    const conversation = await this.db.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: { state: true },
    });
    let stage = this.readStage(conversation.state?.state);
    let prospectAssociated = Boolean(conversation.prospectId);
    const inputMessage = await this.db.message.findUniqueOrThrow({ where: { id: inputMessageId } });
    const commercial = this.commercialBehavior.analyze({
      content: inputMessage.content,
      currentStage: stage,
      role: runtimeContext.role,
      pageIntentHint: runtimeContext.page.intentHint,
      prior: this.readCommercialMemory(conversation.state?.state),
    });
    const policyDecision = this.policyEngine.evaluateInput(inputMessage.content);
    const inputDecision: HenryPolicyDecision = commercial.escalation
      ? {
          action: 'ESCALATE',
          policyId: 'commercial-behavior',
          ruleId: commercial.ruleId,
          reason: commercial.escalation.reason,
          response:
            commercial.escalation.reason === 'UNSUPPORTED_INTENT'
              ? 'No puedo revelar información interna o fuera de su ámbito. Si necesita ayuda legítima, puedo solicitar atención humana.'
              : commercial.escalation.reason === 'LOW_CONFIDENCE'
                ? 'No tengo información suficiente para resolver ese conflicto de fuentes. Solicitaré una revisión humana con evidencia autorizada.'
                : 'Gracias por indicarlo. Registraré el contexto confirmado para que una persona del equipo continúe sin hacerle repetir lo necesario.',
          stage: 'ESCALATION',
        }
      : policyDecision.action !== 'ALLOW' ||
          ['OBJECTION', 'APPOINTMENT', 'SUPPORT'].includes(policyDecision.stage ?? '')
        ? policyDecision
        : {
            action: 'ALLOW',
            policyId: 'commercial-behavior',
            ruleId: commercial.ruleId,
            stage: commercial.stage,
          };
    if (inputDecision.stage && inputDecision.stage !== stage) {
      await this.transitionState(
        conversationId,
        stage,
        inputDecision.stage,
        inputDecision,
        context,
      );
      stage = inputDecision.stage;
    }
    const expert = this.expertCopilot.analyze(inputMessage.content, runtimeContext);
    const paligPlan = this.paligConsultative.analyze(inputMessage.content);
    const memory = this.expertCopilot.memory(conversation.state?.state, runtimeContext, expert);
    memory.workingMemory.consultative = {
      detectedNeed: paligPlan.detectedNeed,
      mode: paligPlan.mode,
      pendingData: paligPlan.nextQuestions,
      questionsAsked: [],
      nextStep: paligPlan.requiredTools[0] ?? null,
    };
    memory.workingMemory.commercial = commercial.memory;
    await this.updateCorporateMemory(conversationId, memory);
    const expertAudit = this.expertCopilot.audit(expert, memory);
    const composed = this.policyComposer.compose({
      stage,
      prospectAssociated,
      intention: conversation.intention,
      roleContext: runtimeContext.role,
      pageContext: runtimeContext.page,
      expert,
    });
    const authorizedMemory = actor ? await this.persistentMemory.list(actor.id) : [];
    const assembled = this.contextAssembler.assemble([
      { kind: 'policies', content: composed.prompt, priority: 1 },
      {
        kind: 'authorization-and-page-context',
        content: this.henryContext.prompt(runtimeContext),
        priority: 2,
      },
      {
        kind: 'conversation-working-memory',
        content: this.expertCopilot.prompt(expert, memory),
        priority: 3,
      },
      {
        kind: 'palig-consultative-governance',
        content: this.paligConsultative.prompt(paligPlan),
        priority: 3,
      },
      {
        kind: 'commercial-behavior',
        content: this.commercialBehavior.prompt(commercial),
        priority: 3,
      },
      {
        kind: 'approved-long-term-memory',
        content: JSON.stringify(
          authorizedMemory.map((item) => ({
            key: item.key,
            value: item.value,
            source: item.source,
            explicit: item.explicit,
          })),
        ),
        priority: 4,
      },
    ]);
    const systemPrompt = assembled.content;
    const execution = await this.db.aIExecution.create({
      data: {
        conversationId,
        inputMessageId,
        provider: this.provider.name,
        model: this.provider.model || 'not-configured',
        policyContext: {
          manualVersion: composed.manualVersion,
          stage,
          appliedPolicies: composed.appliedPolicies,
          roleContext: runtimeContext.role,
          pageContext: runtimeContext.page,
          entityContext: runtimeContext.entity
            ? { type: runtimeContext.entity.type, id: runtimeContext.entity.id }
            : undefined,
          contextBudget: {
            estimatedTokens: assembled.estimatedTokens,
            included: assembled.included,
            truncated: assembled.truncated,
          },
          expert: expertAudit,
          commercialBehavior: this.commercialBehavior.audit(commercial),
        },
      },
    });
    const started = Date.now();
    if (inputDecision.action === 'ESCALATE') {
      await this.tools.escalate(
        inputDecision.reason ?? 'POLICY',
        commercial.escalation?.summary ??
          'Escalamiento preventivo determinado por políticas de Henry.',
        { conversationId, audit: context, decision: inputDecision },
      );
      const output = await this.createAssistantMessage(
        conversationId,
        inputDecision.response!,
        'POLICY_ESCALATION',
        inputDecision,
        expertAudit,
        this.commercialBehavior.audit(commercial),
        channel,
      );
      await this.completeExecution(
        execution.id,
        inputMessageId,
        output.id,
        started,
        0,
        { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, costReported: false },
        'ESCALATED',
        inputDecision.ruleId,
      );
      return { data: { status: 'ESCALATED', message: this.publicMessage(output) } };
    }
    if (commercial.nextBestAction === 'STOP_COMMERCIAL_CONVERSATION') {
      const output = await this.createAssistantMessage(
        conversationId,
        'Entendido. Detendré la conversación comercial y no insistiré. Si más adelante desea retomarla, podrá hacerlo por iniciativa propia.',
        'COMMERCIAL_STOP',
        inputDecision,
        expertAudit,
        this.commercialBehavior.audit(commercial),
        channel,
      );
      await this.completeExecution(
        execution.id,
        inputMessageId,
        output.id,
        started,
        0,
        { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, costReported: false },
        'SUCCEEDED',
      );
      return { data: { status: 'COMPLETED', message: this.publicMessage(output) } };
    }
    if (!this.provider.isConfigured()) {
      const output = await this.createAssistantMessage(
        conversationId,
        'Henry no está disponible en este entorno porque el proveedor o modelo de inteligencia artificial no está configurado. Puede solicitar atención humana.',
        'CONFIGURATION_STATUS',
        undefined,
        undefined,
        undefined,
        channel,
      );
      await this.db.$transaction([
        this.db.message.update({ where: { id: inputMessageId }, data: { status: 'COMPLETED' } }),
        this.db.aIExecution.update({
          where: { id: execution.id },
          data: {
            status: 'CONFIGURATION_REQUIRED',
            outputMessageId: output.id,
            latencyMs: Date.now() - started,
            completedAt: new Date(),
          },
        }),
      ]);
      return { data: { status: 'CONFIGURATION_REQUIRED', message: this.publicMessage(output) } };
    }

    const history = await this.db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 24,
    });
    const messages = this.withinInputBudget([
      { role: 'system', content: systemPrompt },
      ...history
        .reverse()
        .filter((item) => ['USER', 'ASSISTANT'].includes(item.role))
        .map((item) => ({
          role: item.role === 'USER' ? ('user' as const) : ('assistant' as const),
          content: item.content,
        })),
    ]);
    let iterations = 0;
    let totalToolCalls = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;
    let costUsd = 0;
    let costReported = false;
    let authorizedProductEvidence = false;
    try {
      while (iterations <= this.config.maxToolCalls) {
        iterations += 1;
        const result = await this.provider.complete({
          messages,
          tools: this.tools.definitions.filter((tool) =>
            runtimeContext.toolPermissions.includes(tool.name),
          ),
          maxOutputTokens: this.config.maxOutputTokens,
          temperature: this.config.temperature,
        });
        inputTokens += result.usage.inputTokens ?? 0;
        outputTokens += result.usage.outputTokens ?? 0;
        totalTokens += result.usage.totalTokens ?? 0;
        if (result.usage.costUsd !== undefined) {
          costUsd += result.usage.costUsd;
          costReported = true;
        }
        if (!result.toolCalls.length) {
          let content = result.content?.trim();
          if (!content)
            throw new AIProviderError('AI_EMPTY_RESPONSE', 'El proveedor no devolvió contenido');
          let outputDecision = this.policyEngine.evaluateOutput(content);
          const commercialOutputDecision = this.commercialBehavior.evaluateOutput(
            content,
            authorizedProductEvidence,
          );
          if (outputDecision.action === 'ALLOW' && commercialOutputDecision.action === 'REJECT')
            outputDecision = {
              ...commercialOutputDecision,
              reason: 'POLICY',
              stage: 'ESCALATION',
            };
          if (outputDecision.action === 'REJECT') {
            content = outputDecision.response!;
            await this.tools.escalate(
              'POLICY',
              'La respuesta propuesta requería revisión humana por políticas de Henry.',
              { conversationId, audit: context, decision: outputDecision },
            );
            await this.transitionState(
              conversationId,
              stage,
              'ESCALATION',
              outputDecision,
              context,
            );
          }
          const output = await this.createAssistantMessage(
            conversationId,
            content,
            'AI_PROVIDER',
            outputDecision,
            expertAudit,
            this.commercialBehavior.audit(commercial),
            channel,
          );
          await this.completeExecution(
            execution.id,
            inputMessageId,
            output.id,
            started,
            iterations,
            { inputTokens, outputTokens, totalTokens, costUsd, costReported },
            outputDecision.action === 'REJECT' ? 'ESCALATED' : 'SUCCEEDED',
            outputDecision.action === 'REJECT' ? outputDecision.ruleId : undefined,
          );
          console.info(
            JSON.stringify({
              level: 'info',
              event: 'henry_execution_completed',
              conversationId,
              executionId: execution.id,
              provider: result.provider,
              model: result.model,
              latencyMs: Date.now() - started,
              iterations,
              toolCalls: totalToolCalls,
            }),
          );
          return { data: { status: 'COMPLETED', message: this.publicMessage(output) } };
        }
        if (totalToolCalls + result.toolCalls.length > this.config.maxToolCalls)
          throw new AIProviderError(
            'AI_TOOL_LIMIT_REACHED',
            'Se alcanzó el límite de herramientas',
          );
        messages.push({ role: 'assistant', content: result.content, toolCalls: result.toolCalls });
        for (const call of result.toolCalls) {
          totalToolCalls += 1;
          const parsedArguments = this.parseArguments(call.arguments);
          const baseToolDecision = this.policyEngine.evaluateTool(call.name, prospectAssociated);
          const toolDecision =
            baseToolDecision.action === 'REJECT'
              ? baseToolDecision
              : runtimeContext.toolPermissions.includes(call.name)
                ? baseToolDecision
                : { action: 'REJECT' as const, policyId: 'tools', ruleId: 'TOOL-ROLE-DENIED-001' };
          const persisted = await this.db.toolCall.create({
            data: {
              executionId: execution.id,
              providerId: call.id,
              name: call.name,
              input: parsedArguments,
              status: toolDecision.action === 'REJECT' ? 'REJECTED' : 'RUNNING',
              policyId: toolDecision.policyId,
              ruleId: toolDecision.ruleId,
              startedAt: new Date(),
            },
          });
          let output: Record<string, unknown>;
          try {
            if (toolDecision.action === 'REJECT')
              throw new BadRequestException('Herramienta no autorizada para el estado actual');
            output = await this.tools.execute(call.name, parsedArguments, {
              conversationId,
              audit: context,
              decision: toolDecision,
              actor,
            });
            if (['search_knowledge', 'list_authorized_products'].includes(call.name))
              authorizedProductEvidence = true;
            await this.db.toolCall.update({
              where: { id: persisted.id },
              data: {
                status: 'SUCCEEDED',
                completedAt: new Date(),
                result: { create: { success: true, output: output as Prisma.InputJsonValue } },
              },
            });
            if (call.name === 'create_or_update_prospect') prospectAssociated = true;
            const nextStage = this.policyEngine.stageAfterTool(call.name, stage);
            if (nextStage !== stage) {
              await this.transitionState(conversationId, stage, nextStage, toolDecision, context);
              stage = nextStage;
            }
          } catch (error) {
            output = {
              success: false,
              error:
                error instanceof BadRequestException
                  ? error.message
                  : 'No fue posible ejecutar la herramienta',
            };
            const rejected = toolDecision.action === 'REJECT' || !this.tools.isAllowed(call.name);
            await this.db.toolCall.update({
              where: { id: persisted.id },
              data: {
                status: rejected ? 'REJECTED' : 'FAILED',
                errorCode: rejected ? 'UNAUTHORIZED_TOOL' : 'TOOL_EXECUTION_FAILED',
                completedAt: new Date(),
                result: { create: { success: false, output: output as Prisma.InputJsonValue } },
              },
            });
            if (rejected)
              await this.audit.record('HENRY_TOOL_REJECTED', 'ToolCall', persisted.id, context, {
                policyId: toolDecision.policyId,
                ruleId: toolDecision.ruleId,
                tool: call.name,
              });
          }
          messages.push({ role: 'tool', toolCallId: call.id, content: JSON.stringify(output) });
        }
      }
      throw new AIProviderError('AI_LOOP_LIMIT_REACHED', 'Se alcanzó el límite de iteraciones');
    } catch (error) {
      const code = error instanceof AIProviderError ? error.code : 'AI_ORCHESTRATION_FAILED';
      const failureDecision: HenryPolicyDecision = {
        action: 'ESCALATE',
        policyId: 'guardrails',
        ruleId: code.includes('LIMIT') ? 'GRD-LOOP-LIMIT-001' : 'GRD-PROVIDER-ERROR-001',
        reason: code.includes('LIMIT') ? 'AUTOMATION_LIMIT' : 'REPEATED_ERROR',
        stage: 'ESCALATION',
      };
      await this.tools.escalate(
        failureDecision.reason!,
        'Henry no pudo completar el turno y requiere revisión humana.',
        { conversationId, audit: context, decision: failureDecision },
      );
      await this.transitionState(conversationId, stage, 'ESCALATION', failureDecision, context);
      const output = await this.createAssistantMessage(
        conversationId,
        'No pude completar la conversación de forma segura. Registré una solicitud para que una persona del equipo pueda continuar con usted.',
        'SAFE_FALLBACK',
      );
      await this.completeExecution(
        execution.id,
        inputMessageId,
        output.id,
        started,
        iterations,
        { inputTokens, outputTokens, totalTokens, costUsd, costReported },
        'ESCALATED',
        code,
      );
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'henry_execution_escalated',
          conversationId,
          executionId: execution.id,
          provider: this.provider.name,
          model: this.provider.model,
          latencyMs: Date.now() - started,
          errorCode: code,
        }),
      );
      return { data: { status: 'ESCALATED', message: this.publicMessage(output) } };
    }
  }

  private async completeExecution(
    id: string,
    inputMessageId: string,
    outputMessageId: string,
    started: number,
    iterations: number,
    usage: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      costUsd: number;
      costReported: boolean;
    },
    status: AIExecutionStatus,
    errorCode?: string,
  ) {
    await this.db.$transaction([
      this.db.message.update({ where: { id: inputMessageId }, data: { status: 'COMPLETED' } }),
      this.db.aIExecution.update({
        where: { id },
        data: {
          status,
          outputMessageId,
          latencyMs: Date.now() - started,
          iterations,
          errorCode,
          completedAt: new Date(),
          usage: {
            create: {
              inputTokens: usage.inputTokens || undefined,
              outputTokens: usage.outputTokens || undefined,
              totalTokens: usage.totalTokens || undefined,
              estimatedCostUsd: usage.costReported ? usage.costUsd : undefined,
              costSource: usage.costReported ? 'PROVIDER' : undefined,
            },
          },
        },
      }),
    ]);
  }

  private async createAssistantMessage(
    conversationId: string,
    content: string,
    origin: string,
    decision?: HenryPolicyDecision,
    expertAudit?: ReturnType<HenryExpertCopilotService['audit']>,
    commercialAudit?: ReturnType<HenryCommercialBehaviorService['audit']>,
    channel: 'WEB' | 'VOICE' = 'WEB',
  ) {
    const assistant = await this.db.conversationParticipant.findFirstOrThrow({
      where: { conversationId, type: 'ASSISTANT' },
    });
    const message = await this.db.message.create({
      data: {
        conversationId,
        participantId: assistant.id,
        role: 'ASSISTANT',
        channel,
        status: 'COMPLETED',
        content: content.slice(0, 8000),
        origin,
        metadata: {
          ...(decision
            ? { policyId: decision.policyId, ruleId: decision.ruleId, action: decision.action }
            : {}),
          ...(expertAudit ?? {}),
          ...(commercialAudit ? { commercialBehavior: commercialAudit } : {}),
        },
      },
    });
    await this.db.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: message.createdAt },
    });
    return message;
  }

  private async authorizeInternalParticipant(conversationId: string, userId: string) {
    const participant = await this.db.conversationParticipant.findFirst({
      where: { conversationId, userId, type: 'USER' },
    });
    if (!participant) throw new NotFoundException('Conversación interna no encontrada');
  }

  private async updateRuntimeContext(
    conversationId: string,
    roleContext: string,
    pageContext: HenryPageContextInput,
  ) {
    const current = await this.db.conversationState.findUniqueOrThrow({
      where: { conversationId },
    });
    const state =
      current.state && typeof current.state === 'object' && !Array.isArray(current.state)
        ? (current.state as Record<string, Prisma.JsonValue>)
        : {};
    await this.db.conversationState.update({
      where: { conversationId },
      data: {
        version: { increment: 1 },
        state: {
          ...state,
          roleContext,
          pageContext,
          pageContextUpdatedAt: new Date().toISOString(),
        },
      },
    });
  }

  private async updateCorporateMemory(conversationId: string, memory: HenryCorporateMemory) {
    const current = await this.db.conversationState.findUniqueOrThrow({
      where: { conversationId },
    });
    const state =
      current.state && typeof current.state === 'object' && !Array.isArray(current.state)
        ? (current.state as Record<string, Prisma.JsonValue>)
        : {};
    await this.db.conversationState.update({
      where: { conversationId },
      data: {
        version: { increment: 1 },
        state: {
          ...state,
          ...memory,
          manualVersion: HENRY_MANUAL_VERSION,
          memoryUpdatedAt: new Date().toISOString(),
        },
      },
    });
  }

  private async authorize(publicId: string, token: string | undefined) {
    const conversation = await this.db.conversation.findUnique({ where: { publicId } });
    if (!conversation || !token || !constantTimeTokenMatch(token, conversation.accessTokenHash))
      throw new NotFoundException('Conversación no encontrada');
    return conversation;
  }

  private async responseForInput(inputMessageId: string, conversationId: string) {
    const execution = await this.db.aIExecution.findFirst({
      where: { inputMessageId, conversationId },
      include: { outputMessage: true },
      orderBy: { startedAt: 'desc' },
    });
    return {
      data: {
        status: execution?.status ?? 'PROCESSING',
        message: execution?.outputMessage ? this.publicMessage(execution.outputMessage) : null,
      },
    };
  }

  private parseArguments(value: string): Prisma.InputJsonValue {
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      return parsed as Prisma.InputJsonValue;
    } catch {
      throw new BadRequestException('Argumentos de herramienta inválidos');
    }
  }

  private publicMessage(message: {
    id: string;
    role: string;
    content: string;
    status: string;
    createdAt: Date;
  }) {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      status: message.status,
      createdAt: message.createdAt,
    };
  }

  private withinInputBudget(input: AIMessage[]) {
    const system = input[0]!;
    const conversation = input.slice(1);
    const maximumCharacters = this.config.maxInputTokens * 4;
    let used = system.content?.length ?? 0;
    const selected: AIMessage[] = [];
    for (let index = conversation.length - 1; index >= 0; index -= 1) {
      const item = conversation[index]!;
      const size = item.content?.length ?? 0;
      if (used + size > maximumCharacters) break;
      selected.unshift(item);
      used += size;
    }
    return [system, ...selected];
  }

  private readStage(state: Prisma.JsonValue | undefined): HenryConversationStage {
    if (
      state &&
      typeof state === 'object' &&
      !Array.isArray(state) &&
      typeof state.stage === 'string'
    ) {
      const allowed: HenryConversationStage[] = [
        'GREETING',
        'DISCOVERY',
        'DIAGNOSIS',
        'QUALIFICATION',
        'EDUCATION',
        'OBJECTION',
        'CLOSING',
        'APPOINTMENT',
        'ESCALATION',
        'FOLLOW_UP',
        'SUPPORT',
      ];
      if (allowed.includes(state.stage as HenryConversationStage))
        return state.stage as HenryConversationStage;
    }
    return 'DISCOVERY';
  }

  private readCommercialMemory(state: Prisma.JsonValue | undefined) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) return undefined;
    const working = state.workingMemory;
    if (!working || typeof working !== 'object' || Array.isArray(working)) return undefined;
    const commercial = working.commercial;
    if (!commercial || typeof commercial !== 'object' || Array.isArray(commercial))
      return undefined;
    return commercial as unknown as Partial<HenryCommercialMemory>;
  }

  private async transitionState(
    conversationId: string,
    from: HenryConversationStage,
    to: HenryConversationStage,
    decision: HenryPolicyDecision,
    context: AuditContext,
  ) {
    const current = await this.db.conversationState.findUnique({ where: { conversationId } });
    const state =
      current?.state && typeof current.state === 'object' && !Array.isArray(current.state)
        ? (current.state as Record<string, Prisma.JsonValue>)
        : {};
    await this.db.$transaction(async (tx) => {
      await tx.conversationState.upsert({
        where: { conversationId },
        create: {
          conversationId,
          state: {
            ...state,
            stage: to,
            manualVersion: HENRY_MANUAL_VERSION,
            lastTransition: {
              from,
              to,
              policyId: decision.policyId,
              ruleId: decision.ruleId,
              at: new Date().toISOString(),
            },
          },
        },
        update: {
          version: { increment: 1 },
          state: {
            ...state,
            stage: to,
            manualVersion: HENRY_MANUAL_VERSION,
            lastTransition: {
              from,
              to,
              policyId: decision.policyId,
              ruleId: decision.ruleId,
              at: new Date().toISOString(),
            },
          },
        },
      });
      await this.audit.record(
        'HENRY_STATE_TRANSITION',
        'Conversation',
        conversationId,
        context,
        { from, to, policyId: decision.policyId, ruleId: decision.ruleId },
        tx,
      );
    });
  }

  private adminScope(
    actor: Actor,
    where: Prisma.ConversationWhereInput,
  ): Prisma.ConversationWhereInput {
    return actor.permissions.includes('henry.read_all')
      ? where
      : { ...where, prospect: { assignments: { some: { assigneeId: actor.id, endedAt: null } } } };
  }
}
