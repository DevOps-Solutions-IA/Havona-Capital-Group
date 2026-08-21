import { readFileSync } from 'node:fs';
import { join } from 'node:path';
describe('Communications Core transversal', () => {
  it('no depende de Henry y Henry consume el servicio compartido', () => {
    const core = readFileSync(join(__dirname, 'communications.service.ts'), 'utf8'),
      tools = readFileSync(join(__dirname, '..', 'henry', 'henry-tools.service.ts'), 'utf8');
    expect(core).not.toMatch(/from ['"].*henry/);
    expect(tools).toContain(
      "import { CommunicationsService } from '../communications/communications.service'",
    );
    expect(tools).toContain('private readonly communications: CommunicationsService');
  });
  it('providers no contienen reglas CRM ni prompts', () => {
    for (const file of ['meta-whatsapp.provider.ts', 'resend-email.provider.ts']) {
      const source = readFileSync(join(__dirname, file), 'utf8');
      expect(source).not.toMatch(/Prisma|Prospect|Henry|prompt/i);
    }
  });
  it('Compose propaga Resend por referencias de entorno sin hardcodear secretos', () => {
    const compose = readFileSync(
        join(__dirname, '..', '..', '..', '..', 'docker-compose.yml'),
        'utf8',
      ),
      api = compose.slice(compose.indexOf('  api:'), compose.indexOf('  worker:')),
      worker = compose.slice(compose.indexOf('  worker:'), compose.indexOf('  web:'));
    for (const variable of [
      'EMAIL_PROVIDER',
      'RESEND_API_KEY',
      'RESEND_FROM_EMAIL',
      'RESEND_WEBHOOK_SECRET',
      'RESEND_WEBHOOK_URL',
    ])
      expect(api).toContain(`${variable}: \${${variable}`);
    for (const variable of ['RESEND_API_KEY', 'RESEND_FROM_EMAIL'])
      expect(worker).toContain(`${variable}: \${${variable}`);
    expect(worker).not.toMatch(/RESEND_WEBHOOK_(SECRET|URL):/);
    expect(compose).not.toMatch(/re_[A-Za-z0-9_-]{16,}|whsec_[A-Za-z0-9+/=_-]{16,}/);
  });
});
