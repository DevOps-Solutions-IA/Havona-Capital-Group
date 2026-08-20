import { publicTrainingScenario, TRAINING_ROLEPLAY_CATALOG } from './training-roleplay.catalog';

describe('Academia Henry roleplay catalog', () => {
  it('contiene 40+ escenarios sintéticos, tres dificultades y todas las categorías', () => {
    expect(TRAINING_ROLEPLAY_CATALOG.length).toBeGreaterThanOrEqual(40);
    expect(new Set(TRAINING_ROLEPLAY_CATALOG.map((item) => item.scenarioKey)).size).toBe(
      TRAINING_ROLEPLAY_CATALOG.length,
    );
    expect(new Set(TRAINING_ROLEPLAY_CATALOG.map((item) => item.difficulty))).toEqual(
      new Set(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']),
    );
    expect(new Set(TRAINING_ROLEPLAY_CATALOG.map((item) => item.category))).toEqual(
      new Set(['PROSPECTING', 'OPENING', 'DISCOVERY', 'OBJECTION', 'CLOSING', 'COMPLIANCE']),
    );
  });

  it('expone la ficha de práctica sin hechos ocultos, criterios ni objeciones futuras', () => {
    const visible = publicTrainingScenario(TRAINING_ROLEPLAY_CATALOG[0]!);
    expect(visible).not.toHaveProperty('hiddenFacts');
    expect(visible).not.toHaveProperty('successCriteria');
    expect(visible).not.toHaveProperty('failureSignals');
    expect(visible).not.toHaveProperty('objections');
  });

  it('no codifica cifras de producto como verdad contractual', () => {
    const serialized = JSON.stringify(TRAINING_ROLEPLAY_CATALOG);
    expect(serialized).not.toMatch(/prima actual|tasa vigente|edad vigente|cubre automáticamente y/i);
    for (const item of TRAINING_ROLEPLAY_CATALOG) {
      expect(item.allowedFacts).toContain('No existen cifras ni condiciones contractuales autorizadas.');
      expect(item.persona).not.toMatch(/cliente real/i);
    }
  });
});
