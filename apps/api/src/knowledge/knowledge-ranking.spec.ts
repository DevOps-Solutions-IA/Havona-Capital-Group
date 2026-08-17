import { hybridKnowledgeScore } from './knowledge.service';

describe('Knowledge hybrid retrieval ranking', () => {
  const score = (overrides: Partial<Parameters<typeof hybridKnowledgeScore>[0]> = {}) =>
    hybridKnowledgeScore({
      query: '¿Cuál es la prima mensual del Plan A del Producto Básico AP 2026?',
      content: 'Plan A | Prima mensual | $115.000',
      title: 'COL Tarifario AP Colombia 2026',
      section: 'Producto Básico',
      headingPath: ['Tarifario', 'Producto Básico'],
      structuralType: 'TABLE',
      semantic: 0.7,
      ...overrides,
    });

  it('prioriza una tabla pertinente sin depender de nombres PALIG hardcodeados', () => {
    expect(score()).toBeGreaterThan(score({ structuralType: 'TEXT' }));
  });

  it('usa título, sección y jerarquía como contexto documental recuperable', () => {
    const contextual = score({ content: 'Datos y condiciones aplicables' });
    const unrelated = score({
      content: 'Datos y condiciones aplicables',
      title: 'Capacitación maestra de pensión',
      section: 'Régimen pensional',
      headingPath: ['Retiro'],
      structuralType: 'TEXT',
    });
    expect(contextual).toBeGreaterThan(unrelated);
  });

  it('ignora valores no textuales de headingPath sin contaminar el ranking', () => {
    expect(() => score({ headingPath: ['Tarifario', null, 7] })).not.toThrow();
  });
});
