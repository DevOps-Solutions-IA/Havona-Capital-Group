import type { AIToolDefinition } from '../ai/ai-provider';
import { HenryEvidenceContext } from './henry-evidence-context';
import type { ResolvedHenryContext } from './henry-context.service';
import {
  HenryCapabilityRouter,
  HenryToolAuthorizationService,
  HenryToolBudget,
  HenryToolCallCache,
  knowledgeToolInputs,
  mergeKnowledgeToolOutputs,
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

  it('preserva la regla auditable para una tool inexistente o inyectada', () => {
    expect(
      authorization.evaluate({
        toolName: 'execute_sql',
        runtimeContext: context(['execute_sql']),
        prospectAssociated: true,
        availableDefinitions: new Set(definitions.map((item) => item.name)),
      }),
    ).toEqual(expect.objectContaining({ action: 'REJECT', ruleId: 'TOOL-NOT-ALLOWLISTED-001' }));
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
    expect(selection.retrievalLayers).toEqual(['SALES_INTELLIGENCE', 'PRODUCT_TRUTH']);
  });

  it('planifica un solo carril para preguntas exclusivamente comerciales o de producto', () => {
    const sales = router.select({
      content: '¿Cómo manejo una objeción sin presionar?',
      stage: 'OBJECTION',
      commercialIntent: 'OBJECTION',
      runtimeContext: context(['search_knowledge']),
      definitions,
      authorization,
      prospectAssociated: false,
    });
    const product = router.select({
      content: '¿Qué cobertura tiene Vida Flex MAX?',
      stage: 'DISCOVERY',
      commercialIntent: 'PRODUCT_INTEREST',
      runtimeContext: context(['search_knowledge']),
      definitions,
      authorization,
      prospectAssociated: false,
    });
    expect(sales.retrievalLayers).toEqual(['SALES_INTELLIGENCE']);
    expect(product.retrievalLayers).toEqual(['PRODUCT_TRUTH']);
  });

  it('planifica Product Truth y Compliance para una garantía material', () => {
    const selection = router.select({
      content: '¿Puedo decir que Vida Flex MAX garantiza rentabilidad?',
      stage: 'DISCOVERY',
      commercialIntent: 'PRODUCT_INTEREST',
      runtimeContext: context(['search_knowledge']),
      definitions,
      authorization,
      prospectAssociated: false,
    });
    expect(selection.retrievalLayers).toEqual(['PRODUCT_TRUTH', 'COMPLIANCE']);
  });

  it('expande deterministicamente una consulta híbrida y conserva ambos resultados', () => {
    const inputs = knowledgeToolInputs('search_knowledge', { query: 'Vida Flex MAX está caro' }, [
      'SALES_INTELLIGENCE',
      'PRODUCT_TRUTH',
    ]);
    expect(inputs).toEqual([
      { query: 'Vida Flex MAX está caro', evidenceLayer: 'SALES_INTELLIGENCE' },
      { query: 'Vida Flex MAX está caro', evidenceLayer: 'PRODUCT_TRUTH' },
    ]);
    expect(
      mergeKnowledgeToolOutputs([
        {
          layer: 'SALES_INTELLIGENCE',
          output: { answerStatus: 'GROUNDED', results: [{ id: 'training' }], context: [] },
        },
        {
          layer: 'PRODUCT_TRUTH',
          output: { answerStatus: 'GROUNDED', results: [{ id: 'contract' }], context: [] },
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        answerStatus: 'GROUNDED',
        results: [
          { id: 'training', evidenceLayer: 'SALES_INTELLIGENCE' },
          { id: 'contract', evidenceLayer: 'PRODUCT_TRUTH' },
        ],
        retrievalLayers: [
          expect.objectContaining({ layer: 'SALES_INTELLIGENCE', resultCount: 1 }),
          expect.objectContaining({ layer: 'PRODUCT_TRUTH', resultCount: 1 }),
        ],
      }),
    );
  });

  it('tipa también una consulta de un solo carril antes de ejecutarla', () => {
    expect(
      knowledgeToolInputs('search_knowledge', { query: 'cobertura Vida Flex' }, ['PRODUCT_TRUTH']),
    ).toEqual([{ query: 'cobertura Vida Flex', evidenceLayer: 'PRODUCT_TRUTH' }]);
  });

  it('deduplica por chunk canónico resultados y contexto recuperados en dos carriles', () => {
    const citation = { chunkId: 'chunk-1' };
    const merged = mergeKnowledgeToolOutputs([
      {
        layer: 'SALES_INTELLIGENCE',
        output: {
          answerStatus: 'GROUNDED',
          results: [{ content: 'evidencia', citation }],
          context: [{ content: 'evidencia', citation }],
        },
      },
      {
        layer: 'PRODUCT_TRUTH',
        output: {
          answerStatus: 'GROUNDED',
          results: [{ content: 'evidencia', citation }],
          context: [{ content: 'evidencia', citation }],
        },
      },
    ]);
    expect(merged.results).toHaveLength(1);
    expect(merged.context).toHaveLength(1);
  });

  it('rechaza en ejecución una tool conocida que no fue seleccionada para el turno', () => {
    expect(
      authorization.evaluate({
        toolName: 'create_task',
        runtimeContext: context(['create_task']),
        prospectAssociated: true,
        availableDefinitions: new Set(['search_knowledge']),
      }),
    ).toEqual(expect.objectContaining({ action: 'REJECT', ruleId: 'TOOL-NOT-ALLOWLISTED-001' }));
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
    expect(budget.consumeMany('READ', 2)).toBe(true);
    expect(budget.consumeMany('READ', 1)).toBe(false);
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

  it('respeta el carril Sales solicitado aunque la fuente corporativa tenga autoridad técnica', () => {
    const evidence = new HenryEvidenceContext();
    const output = result('CORPORATIVO', 4, 'HAVONA Sales Foundations', 'CURRENT');
    evidence.ingest('search_knowledge', {
      ...output,
      evidenceLayer: 'SALES_INTELLIGENCE',
    });
    expect(evidence.snapshot().salesIntelligence).toHaveLength(1);
    expect(evidence.snapshot().productTruth).toHaveLength(0);
  });

  it('registra las colecciones de evidencia sin duplicarlas', () => {
    const evidence = new HenryEvidenceContext();
    const output = result('CONTRACTUAL', 2, 'Vida Flex MAX', 'CURRENT');
    const withCollection = {
      ...output,
      results: output.results.map((item) => ({
        ...item,
        citation: { ...item.citation, collectionKey: 'palig-approved' },
      })),
    };
    evidence.ingest('search_knowledge', withCollection);
    evidence.ingest('search_knowledge', withCollection);
    expect(evidence.collections()).toEqual(['palig-approved']);
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
