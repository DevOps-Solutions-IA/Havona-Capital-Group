import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashPassword } from '@havona/auth';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AI_PROVIDER, type AICompletionResult } from '../src/ai/ai-provider';
import { FakeAIProvider } from '../src/ai/fake-ai.provider';
import { PrismaService } from '../src/common/prisma.service';
import { KnowledgeService } from '../src/knowledge/knowledge.service';

type SyntheticIdentity = {
  id: string;
  email: string;
  password: string;
  role: 'CONSULTOR' | 'GERENTE';
};

type AuthenticatedAgent = {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
};

const completion = (
  content: string | null,
  toolCalls: AICompletionResult['toolCalls'] = [],
): AICompletionResult => ({
  provider: 'fake',
  model: 'fake/henry-hybrid-e2e',
  content,
  toolCalls,
  finishReason: toolCalls.length ? 'tool_calls' : 'stop',
  usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
});

describe('Henry Hybrid RAG autenticado con identidades sintéticas', () => {
  let app: INestApplication;
  let db: PrismaService;
  let knowledge: KnowledgeService;
  let admin: { id: string; roles: string[]; permissions: string[] };
  const ai = new FakeAIProvider();
  const identities = new Map<string, SyntheticIdentity>();

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AI_PROVIDER)
      .useValue(ai)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    app.use(cookieParser());
    await app.init();
    db = app.get(PrismaService);
    knowledge = app.get(KnowledgeService);

    const adminUser = await db.user.findUniqueOrThrow({
      where: { email: process.env.INITIAL_SUPER_ADMIN_EMAIL },
    });
    const adminPermissions = (
      await db.rolePermission.findMany({
        where: { role: { name: 'SUPER_ADMIN' } },
        include: { permission: true },
      })
    ).map((row) => row.permission.key);
    admin = { id: adminUser.id, roles: ['SUPER_ADMIN'], permissions: adminPermissions };

    for (const [key, role] of [
      ['consultor-a', 'CONSULTOR'],
      ['gerente-a', 'GERENTE'],
      ['consultor-b', 'CONSULTOR'],
      ['gerente-b', 'GERENTE'],
    ] as const) {
      const password = `Synthetic-${randomUUID()}-Aa1!`;
      const roleRecord = await db.role.findUniqueOrThrow({ where: { name: role } });
      const user = await db.user.create({
        data: {
          email: `test.${key}.${randomUUID()}@havona.test`,
          name: `TEST ${key.toUpperCase()}`,
          passwordHash: await hashPassword(password),
          roles: { create: { roleId: roleRecord.id } },
        },
      });
      identities.set(key, { id: user.id, email: user.email, password, role });
    }
    await db.calendarTeamMembership.createMany({
      data: [
        {
          managerId: identities.get('gerente-a')!.id,
          memberId: identities.get('consultor-a')!.id,
          createdById: admin.id,
        },
        {
          managerId: identities.get('gerente-b')!.id,
          memberId: identities.get('consultor-b')!.id,
          createdById: admin.id,
        },
      ],
    });

    const collection = await knowledge.createCollection(
      {
      key: `henry-hybrid-e2e-${randomUUID()}`,
      name: 'TEST Henry Hybrid RAG',
      allowedRoles: ['CONSULTOR', 'GERENTE', 'SUPER_ADMIN'],
      },
      admin,
    );
    await publishFixture({
      collectionId: collection.id,
      title: 'TEST HAVONA Objection Intelligence',
      classification: 'TRAINING',
      sourceType: 'CAPACITACION',
      authorityLevel: 'TRAINING',
      content:
        '# Objeción de precio\n\nAnte “está caro”, explorar capacidad, comparación, prioridad y valor percibido sin presionar. No discutir precio automáticamente.',
    });
    await publishFixture({
      collectionId: collection.id,
      title: 'TEST Vida Flex MAX Product Truth',
      classification: 'GENERAL',
      sourceType: 'CONTRACTUAL',
      authorityLevel: 'CONTRACTUAL_GENERAL',
      content:
        '# Verificación autorizada\n\nAntes de responder sobre Vida Flex MAX deben verificarse la versión contractual aplicable, condiciones, exclusiones y la ilustración individual. Esta fuente no garantiza rentabilidad.',
    });
    await publishFixture({
      collectionId: collection.id,
      title: 'TEST Compliance de garantías',
      classification: 'COMPLIANCE',
      sourceType: 'CORPORATIVO',
      authorityLevel: 'OFFICIAL_TECHNICAL',
      content:
        '# Cumplimiento\n\nNo presentar tasas ilustradas, aceptación, rentabilidad ni pago de siniestros como garantías.',
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  async function publishFixture(input: {
    collectionId: string;
    title: string;
    classification: 'GENERAL' | 'TRAINING' | 'COMPLIANCE';
    sourceType: 'CONTRACTUAL' | 'CAPACITACION' | 'CORPORATIVO';
    authorityLevel: 'CONTRACTUAL_GENERAL' | 'TRAINING' | 'OFFICIAL_TECHNICAL';
    content: string;
  }) {
    const buffer = Buffer.from(input.content);
    const document = await knowledge.createDocument(
      {
        ...input,
        currentStatus: 'CURRENT',
        publicAllowed: false,
        consultantAllowed: true,
        managerAllowed: true,
      },
      {
        buffer,
        size: buffer.length,
        mimetype: 'text/markdown',
        originalname: `${input.title.replace(/\W+/g, '-').toLowerCase()}.md`,
      } as Express.Multer.File,
      admin,
      undefined,
      'MANUAL',
    );
    await knowledge.processVersion(document.versions[0]!.id);
    await knowledge.approve(document.id, admin);
    await knowledge.publish(document.id, admin);
  }

  async function login(identity: SyntheticIdentity): Promise<AuthenticatedAgent> {
    const agent = request.agent(app.getHttpServer());
    const response = await agent
      .post('/api/v1/auth/login')
      .send({ email: identity.email, password: identity.password })
      .expect(201);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    const csrfCookie = cookies.find((cookie) => cookie.startsWith('havona_csrf='));
    expect(csrfCookie).toBeDefined();
    return { agent, csrf: decodeURIComponent(csrfCookie!.split(';')[0]!.split('=')[1]!) };
  }

  async function conversation(auth: AuthenticatedAgent) {
    const response = await auth.agent
      .post('/api/v1/henry/internal/conversations')
      .set('X-CSRF-Token', auth.csrf)
      .send({
        channel: 'WEB',
        consent: { accepted: true, privacyVersion: 'test-privacy-v1' },
        entryPoint: 'henry-hybrid-e2e',
        pageContext: { pageType: 'dashboard' },
      })
      .expect(201);
    return response.body.data as { id: string; accessToken: string };
  }

  async function executePrompt(input: {
    auth: AuthenticatedAgent;
    prompt: string;
    toolQuery?: string;
    finalResponse: string;
  }) {
    const created = await conversation(input.auth);
    ai.enqueue(
      completion(null, [
        {
          id: `search-${randomUUID()}`,
          name: 'search_knowledge',
          arguments: JSON.stringify({ query: input.toolQuery ?? input.prompt }),
        },
      ]),
    );
    ai.enqueue(completion(input.finalResponse));
    const response = await input.auth.agent
      .post(`/api/v1/henry/internal/conversations/${created.id}/messages`)
      .set('X-CSRF-Token', input.auth.csrf)
      .set('X-Henry-Token', created.accessToken)
      .send({ messageId: randomUUID(), content: input.prompt })
      .expect(201);
    const persisted = await db.conversation.findUniqueOrThrow({
      where: { publicId: created.id },
      include: {
        executions: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          include: { toolCalls: { include: { result: true } } },
        },
      },
    });
    return {
      response: response.body.data,
      conversation: created,
      execution: persisted.executions[0]!,
    };
  }

  it('certifica Hybrid, Sales-only, Product-only, Compliance e insuficiencia por el API autenticado', async () => {
    const auth = await login(identities.get('consultor-a')!);
    const hybrid = await executePrompt({
      auth,
      prompt:
        'Tengo un prospecto que dice que Vida Flex MAX está caro. ¿Cómo debo manejar la objeción sin presionarlo y qué información de producto necesitas verificar antes de responder?',
      finalResponse:
        'Primero aclararía qué significa “caro” sin presionar. Antes de afirmar condiciones de Vida Flex MAX verificaría la versión contractual aplicable, sus condiciones y exclusiones; no inventaría cifras ni garantías.',
    });
    expect(hybrid.response.status).toBe('COMPLETED');
    expect(hybrid.execution.status).toBe('SUCCEEDED');
    expect(hybrid.execution.errorCode).toBeNull();
    expect(hybrid.execution.toolCalls).toHaveLength(1);
    expect(hybrid.execution.toolCalls[0]).toEqual(
      expect.objectContaining({ name: 'search_knowledge', status: 'SUCCEEDED' }),
    );
    expect(hybrid.execution.toolCalls[0]!.result?.output).toEqual(
      expect.objectContaining({
        retrievalLayers: expect.arrayContaining([
          expect.objectContaining({ layer: 'SALES_INTELLIGENCE' }),
          expect.objectContaining({ layer: 'PRODUCT_TRUTH' }),
        ]),
      }),
    );
    const hybridOutput = hybrid.execution.toolCalls[0]!.result!.output as {
      results: Array<{ evidenceLayer: string; citation: { title: string } }>;
      retrievalLayers: Array<{ layer: string; resultCount: number }>;
    };
    expect(hybridOutput.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceLayer: 'SALES_INTELLIGENCE',
          citation: expect.objectContaining({ title: 'TEST HAVONA Objection Intelligence' }),
        }),
        expect.objectContaining({
          evidenceLayer: 'PRODUCT_TRUTH',
          citation: expect.objectContaining({ title: 'TEST Vida Flex MAX Product Truth' }),
        }),
      ]),
    );
    expect(hybridOutput.retrievalLayers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ layer: 'SALES_INTELLIGENCE', resultCount: expect.any(Number) }),
        expect.objectContaining({ layer: 'PRODUCT_TRUTH', resultCount: expect.any(Number) }),
      ]),
    );
    expect(hybridOutput.retrievalLayers.every((layer) => layer.resultCount > 0)).toBe(true);
    expect(hybrid.execution.policyContext).toEqual(
      expect.objectContaining({
        capability: 'SALES_KNOWLEDGE',
        selectedTools: ['search_knowledge', 'get_knowledge_document', 'list_authorized_products'],
        plannedRetrievalLayers: ['SALES_INTELLIGENCE', 'PRODUCT_TRUTH'],
        toolRejected: 0,
        toolBudgetUsed: 2,
        finalResolution: 'SAFE_RESPONSE',
        knowledgeCollections: expect.arrayContaining([expect.stringMatching(/^henry-hybrid-e2e-/)]),
      }),
    );

    const sales = await executePrompt({
      auth,
      prompt: '¿Cómo debo manejar una objeción de precio sin presionar al prospecto?',
      finalResponse:
        'Explora si la objeción refleja capacidad, comparación, prioridad o valor percibido, con una pregunta respetuosa y sin presionar.',
    });
    expect(sales.execution.policyContext).toEqual(
      expect.objectContaining({ plannedRetrievalLayers: ['SALES_INTELLIGENCE'] }),
    );

    const product = await executePrompt({
      auth,
      prompt: '¿Qué información autorizada tenemos actualmente sobre Vida Flex MAX?',
      finalResponse:
        'La fuente contractual disponible exige revisar la versión aplicable, condiciones y exclusiones. No debo convertirla en una garantía universal.',
    });
    expect(product.execution.policyContext).toEqual(
      expect.objectContaining({
        plannedRetrievalLayers: ['PRODUCT_TRUTH'],
        productTruthEvidenceCount: expect.any(Number),
      }),
    );
    expect((product.execution.policyContext as any).productTruthEvidenceCount).toBeGreaterThan(0);

    const compliance = await executePrompt({
      auth,
      prompt: '¿Puedo decirle al cliente que Vida Flex MAX le garantiza rentabilidad?',
      toolQuery: 'cumplimiento garantías rentabilidad Vida Flex MAX',
      finalResponse:
        'No. No debo presentar rentabilidad ni tasas ilustradas como una garantía; corresponde verificar evidencia contractual aplicable.',
    });
    expect(compliance.response.message.content).not.toMatch(/garantiza rentabilidad/i);
    expect(compliance.execution.status).toBe('SUCCEEDED');
    expect(compliance.execution.policyContext).toEqual(
      expect.objectContaining({
        plannedRetrievalLayers: expect.arrayContaining(['PRODUCT_TRUTH', 'COMPLIANCE']),
        complianceEvidenceCount: expect.any(Number),
        toolRejected: 0,
      }),
    );
    expect((compliance.execution.policyContext as any).complianceEvidenceCount).toBeGreaterThan(0);

    const insufficient = await executePrompt({
      auth,
      prompt: '¿Cuál es la bonificación contractual marciana exacta de Vida Flex MAX?',
      toolQuery: 'bonificación contractual marciana inexistente qzxy',
      finalResponse:
        'Esta información no se encuentra dentro de la base de conocimiento autorizada de HAVONA CAPITAL GROUP.',
    });
    expect(insufficient.response.status).toBe('COMPLETED');
    expect(insufficient.execution.status).toBe('SUCCEEDED');
    expect(insufficient.execution.errorCode).toBeNull();
  });

  it('aísla conversaciones entre usuarios sintéticos y preserva equipos separados', async () => {
    const consultantA = await login(identities.get('consultor-a')!);
    const consultantB = await login(identities.get('consultor-b')!);
    const created = await conversation(consultantA);
    await consultantB.agent
      .get(`/api/v1/henry/internal/conversations/${created.id}`)
      .set('X-Henry-Token', created.accessToken)
      .expect(404);
    expect(
      await db.calendarTeamMembership.count({
        where: {
          managerId: identities.get('gerente-a')!.id,
          memberId: identities.get('consultor-b')!.id,
        },
      }),
    ).toBe(0);
    expect(
      await db.calendarTeamMembership.count({
        where: {
          managerId: identities.get('gerente-b')!.id,
          memberId: identities.get('consultor-a')!.id,
        },
      }),
    ).toBe(0);
  });

  it('no anuncia herramientas fuera de la capability y registra rechazo de tool inyectada', async () => {
    const auth = await login(identities.get('consultor-a')!);
    const created = await conversation(auth);
    ai.enqueue(
      completion(null, [{ id: `injected-${randomUUID()}`, name: 'create_task', arguments: '{}' }]),
    );
    ai.enqueue(completion('No ejecutaré herramientas ajenas a esta consulta de conocimiento.'));
    await auth.agent
      .post(`/api/v1/henry/internal/conversations/${created.id}/messages`)
      .set('X-CSRF-Token', auth.csrf)
      .set('X-Henry-Token', created.accessToken)
      .send({ messageId: randomUUID(), content: '¿Cómo manejo una objeción de precio?' })
      .expect(201);
    const row = await db.conversation.findUniqueOrThrow({
      where: { publicId: created.id },
      include: { executions: { include: { toolCalls: true } } },
    });
    const execution = row.executions[0]!;
    expect(execution.policyContext).toEqual(
      expect.objectContaining({
        selectedTools: expect.not.arrayContaining(['create_task']),
        toolRejected: 1,
      }),
    );
    expect(execution.toolCalls[0]).toEqual(
      expect.objectContaining({
        name: 'create_task',
        status: 'REJECTED',
        errorCode: 'UNAUTHORIZED_TOOL',
        ruleId: 'TOOL-NOT-ALLOWLISTED-001',
      }),
    );
  });
});
