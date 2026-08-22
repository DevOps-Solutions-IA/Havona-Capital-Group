import { HenryContextAssembler } from './henry-context-assembler.service';

describe('HenryContextAssembler', () => {
  it('prioriza políticas y conserva evidencia con procedencia dentro del presupuesto', () => {
    const assembler = new HenryContextAssembler();
    const result = assembler.assemble(
      [
        { kind: 'POLICIES', content: 'guardrail', priority: 1 },
        { kind: 'AUTHORIZATION', content: 'CONSULTOR', priority: 2 },
        {
          kind: 'KNOWLEDGE_EVIDENCE',
          content: 'Fuente X v2 sección 3',
          priority: 3,
          citations: [{ chunkId: 'chunk-x' }],
        },
        { kind: 'USER_REQUEST', content: '¿Qué dice la fuente?', priority: 4 },
      ],
      120,
    );
    expect(result.content).toContain('POLICIES');
    expect(result.content).toContain('KNOWLEDGE_EVIDENCE');
    expect(result.content).toContain('Fuente X v2 sección 3');
    expect(result.estimatedTokens).toBeLessThanOrEqual(120);
  });
});
