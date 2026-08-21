import fs from 'node:fs';
import path from 'node:path';

describe('Arquitectura de Cadences', () => {
  const read = (file: string) => fs.readFileSync(path.join(process.cwd(), 'src', file), 'utf8');
  it('reutiliza Automations y Communications sin worker/provider paralelo', () => {
    const service = read('cadences/cadence.service.ts');
    const queue = read('automations/automation-queue.service.ts');
    expect(service).toContain('AutomationQueueService');
    expect(service).toContain('CommunicationsService');
    expect(service).not.toMatch(/new Worker|new Queue|ResendEmailProvider|MetaWhatsAppProvider/);
    expect(queue).toContain("'automation.cadence-step'");
  });
  it('revalida inmediatamente antes del efecto y conserva idempotencia', () => {
    const service = read('cadences/cadence.service.ts');
    expect(service).toContain('await this.revalidate(item)');
    expect(service).toContain('idempotencyKey: this.hash(item.idempotencyKey)');
    expect(service).toContain("status: 'CLAIMED'");
  });
});
