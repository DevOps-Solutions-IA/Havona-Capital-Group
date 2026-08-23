import type { AIToolDefinition } from '../ai/ai-provider';
import { HenryEvidenceContext } from './henry-evidence-context';
import type { ResolvedHenryContext } from './henry-context.service';
import {
  HenryCapabilityRouter,
  HenryToolAuthorizationService,
  HenryToolBudget,
  HenryToolCallCache,
} from './henry-tool-orchestration.service';

const definition = (name: string): AIToolDefinition => ({
  name,
  description: name,
  parameters: { type: 'object', properties: {} },
});

const context = (toolPermissions: string[], role: ResolvedHenryContext['role'] = 'CONSULTANT') =>
  ({ role, page: { pageType: 'dashboard' }, toolPermissions }) as ResolvedHenryContext;

describe('Henry enterprise tool orchestration', () => {
  const authorization = new HenryToolAuthorizationService();
  const router = new HenryCapabilityRouter();
  const definitions = [
    definition('search_knowledge'),
    definition('get_knowledge_document'),
    definition('list_authorized_products'),
    definition('create_task'),
    ...Array.from({ length: 74 }, (_, index) => definition(`irrelevant_${index}`)),
  ];

  it('permite Knowledge read para un actor autorizado sin exigir prospecto', () => {
    expect(
      authorization.evaluate({
        toolName: 'search_knowledge',
        runtimeContext: context(['search_knowledge']),
        prospectAssociated: false,
        availableDefinitions: new Set(definitions.map((item) => item.name)),
      }),
    ).toEqual(expect.objectContaining({ action: 'ALLOW', ruleId: 'TOOL-CONTEXT-ALLOW-001' }));
  });

  it('rechaza Knowledge por RBAC y nunca selecciona la tool para anunciarla', () => {
    const runtimeContext = context([]);
    expect(
      authorization.evaluate({
        toolName: 'search_knowledge',
        runtimeContext,
        prospectAssociated: false,
        availableDefinitions: new Set(definitions.map((item) => item.name)),
      }).ruleId,
    ).toBe('TOOL-ROLE-DENIED-001');
    expect(
      router
        .select({
          content: '¿Qué cobertura tiene el producto?',
          stage: 'DISCOVERY',
          commercialIntent: 'PRODUCT_INTEREST',
          runtimeContext,
          definitions,
          authorization,
          prospectAssociated: false,
        })
        .selectedTools.map((item) => item.name),
    ).not.toContain('search_knowledge');
  });

  it('reduce 77 definitions a las capabilities de Sales Knowledge', () => {
    const selection = router.select({
      content:
        'Tengo un prospecto que dice que Vida Flex MAX está caro. ¿Cómo manejo la objeción y qué debo verificar?',
      stage: 'OBJECTION',
      commercialIntent: 'OBJECTION',
      runtimeContext: context([
        'search_knowledge',
        'get_knowledge_document',
        'list_authorized_products',
      ]),
      definitions,
      authorization,
      prospectAssociated: false,
    });
    expect(selection.capability).toBe('SALES_KNOWLEDGE');
    expect(selection.selectedTools.map((item) => item.name)).toEqual([
      'search_knowledge',
      'get_knowledge_document',
      'list_authorized_products',
    ]);
    expect(selection.selectedTools).toHaveLength(3);
  });

  it('mantiene mutaciones sujetas a prospecto y presupuesto separado', () => {
    expect(
      authorization.evaluate({
        toolName: 'create_task',
        runtimeContext: context(['create_task']),
        prospectAssociated: false,
        availableDefinitions: new Set(definitions.map((item) => item.name)),
      }).ruleId,
    ).toBe('TOOL-PROSPECT-REQUIRED-001');
    const budget = new HenryToolBudget(4, 1);
    expect(budget.consume('MUTATION')).toBe(true);
    expect(budget.consume('MUTATION')).toBe(false);
    expect(budget.consume('READ')).toBe(true);
  });

  it('deduplica argumentos semánticamente iguales sin consumir otro call', () => {
    const cache = new HenryToolCallCache();
    const first = cache.fingerprint('search_knowledge', {
      query: 'Vida Flex',
      evidenceLayer: 'PRODUCT_TRUTH',
    });
    const repeated = cache.fingerprint('search_knowledge', {
      evidenceLayer: 'PRODUCT_TRUTH',
      query: 'Vida Flex',
    });
    expect(first).toBe(repeated);
    cache.set(first, { answerStatus: 'GROUNDED' });
    expect(cache.get(repeated)).toEqual({ answerStatus: 'GROUNDED' });
  });
});

describe('Henry typed evidence', () => {
  const result = (
    sourceType: string,
    authorityRank: number,
    title: string,
    currentStatus = 'UNKNOWN',
  ) => ({
    results: [
      {
        citation: {
          documentId: `${sourceType}-${authorityRank}-${title}`,
          title,
          sourceType,
          authorityRank,
          currentStatus,
          conflicts: [],
        },
      },
    ],
  });

  it('TRAINING orienta ventas pero nunca establece Product Truth', () => {
    const evidence = new HenryEvidenceContext();
    evidence.ingest('search_knowledge', result('CAPACITACION', 5, 'Objection Intelligence'));
    expect(evidence.snapshot().salesIntelligence).toHaveLength(1);
    expect(evidence.hasProductTruth()).toBe(false);
  });

  it('evidencia contractual/official establece Product Truth', () => {
    const evidence = new HenryEvidenceContext();
    evidence.ingest('search_knowledge', result('CONTRACTUAL', 2, 'Vida Flex MAX', 'CURRENT'));
    expect(evidence.snapshot().productTruth).toHaveLength(1);
    expect(evidence.hasProductTruth()).toBe(true);
  });

  it('conserva simultáneamente Training y Product Truth sin que Training lo reemplace', () => {
    const evidence = new HenryEvidenceContext();
    evidence.ingest('search_knowledge', result('CAPACITACION', 5, 'Sales Foundations'));
    evidence.ingest('search_knowledge', result('CONTRACTUAL', 2, 'Vida Flex MAX', 'CURRENT'));
    const snapshot = evidence.snapshot();
    expect(snapshot.salesIntelligence).toHaveLength(1);
    expect(snapshot.productTruth).toHaveLength(1);
    expect(snapshot.productTruth[0]?.authorityRank).toBe(2);
  });

  it('conserva Product Truth UNKNOWN pero no lo usa para afirmar vigencia', () => {
    const evidence = new HenryEvidenceContext();
    evidence.ingest('search_knowledge', result('CONTRACTUAL', 2, 'Vida Flex MAX'));
    expect(evidence.snapshot().productTruth).toHaveLength(1);
    expect(evidence.hasProductTruth()).toBe(false);
  });

  it('ignora resultados rechazados/fallidos sin citations válidas', () => {
    const evidence = new HenryEvidenceContext();
    evidence.ingest('search_knowledge', { success: false, error: 'UNAUTHORIZED_TOOL' });
    evidence.ingest('list_authorized_products', { data: [{ id: 'product' }] });
    expect(evidence.hasAny()).toBe(false);
    expect(evidence.hasProductTruth()).toBe(false);
  });
});
