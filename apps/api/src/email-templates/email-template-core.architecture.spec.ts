import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Email Template Core transversal', () => {
  it('no depende de Resend ni de providers de Communications', () => {
    const source = readFileSync(join(__dirname, 'email-template.service.ts'), 'utf8');
    expect(source).not.toContain('ResendEmailProvider');
    expect(source).not.toContain('EMAIL_PROVIDER');
    expect(source).not.toContain('.send(');
    expect(source).toContain('providerDispatched: false');
  });
});
