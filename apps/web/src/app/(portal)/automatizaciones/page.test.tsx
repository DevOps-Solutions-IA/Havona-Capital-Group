import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
describe('Bandeja de automatizaciones', () => {
  const source = readFileSync(join(__dirname, 'page.tsx'), 'utf8');
  it('usa API real y no presenta métricas ficticias', () => {
    expect(source).toContain('automationsApi.create');
    expect(source).toMatch(/automationsApi\.status\(selected\.id,\s*'ACTIVE'\)/);
    expect(source).toContain('Todavía no hay ejecuciones reales');
    expect(source).not.toContain('mock');
  });
  it('solo presenta acciones productivas implementadas', () => {
    expect(source).toContain('CREATE_CRM_TASK');
    expect(source).not.toContain('drag');
  });
});
