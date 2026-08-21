import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Henry Messaging architecture', () => {
  it('Henry consumes corporate cores and never imports Resend or Meta providers', () => {
    const source = readFileSync(join(__dirname, 'henry-messaging-operator.service.ts'), 'utf8');
    expect(source).toContain('CommunicationsService');
    expect(source).toContain('AutomationQueueService');
    expect(source).toContain('EmailTemplateService');
    expect(source).not.toContain('ResendEmailProvider');
    expect(source).not.toContain('MetaWhatsAppProvider');
    expect(source).not.toContain('fetch(');
  });

  it('Communications Core does not depend on Henry', () => {
    const source = readFileSync(
      join(__dirname, '..', 'communications', 'communications.service.ts'),
      'utf8',
    );
    expect(source).not.toContain("from '../henry");
  });
});
