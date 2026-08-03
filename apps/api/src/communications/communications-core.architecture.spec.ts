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
});
