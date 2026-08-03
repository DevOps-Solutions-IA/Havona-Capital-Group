import { readFileSync } from 'node:fs';
import { join } from 'node:path';
describe('Arquitectura transversal de Automations Core', () => {
  it('no depende de providers externos y Henry consume el core', () => {
    const service = readFileSync(join(__dirname, 'automation.service.ts'), 'utf8');
    const tools = readFileSync(join(__dirname, '../henry/henry-tools.service.ts'), 'utf8');
    expect(service).not.toContain('MetaWhatsAppProvider');
    expect(service).not.toContain('ResendEmailProvider');
    expect(service).not.toContain('OpenRouterProvider');
    expect(tools).toContain('AutomationService');
    expect(tools).toContain('pause_automation_for_entity');
  });
  it('no ejecuta código dinámico', () => {
    const service = readFileSync(join(__dirname, 'automation.service.ts'), 'utf8');
    expect(service).not.toMatch(/\beval\s*\(/);
    expect(service).not.toContain('new Function');
  });
  it('libera el worker al apagar y recupera trabajo persistente al iniciar', () => {
    const processor = readFileSync(join(__dirname, 'automation-processor.service.ts'), 'utf8');
    expect(processor).toContain('recoverPending()');
    expect(processor).toContain('close(true)');
  });
});
