import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Communications worker boundary', () => {
  const source = readFileSync(join(__dirname, 'queue.service.ts'), 'utf8');

  it('consume el transporte compartido y no duplica la API HTTP de Resend', () => {
    expect(source).toContain('sendResendEmail');
    expect(source).not.toContain('https://api.resend.com/emails');
  });

  it('revalida consentimiento, contacto, template, adjuntos y PALIG antes del dispatch', () => {
    for (const contract of [
      'COMMUNICATION_CONSENT_REQUIRED',
      'CONTACT_INVALID',
      'EMAIL_TEMPLATE_NOT_OPERATIONAL',
      'ATTACHMENTS_NOT_DISPATCHABLE',
      'validatePaligMessagingContext',
    ])
      expect(source).toContain(contract);
  });

  it('solo reintenta fallos transitorios y reclama el mensaje con SENDING', () => {
    expect(source).toContain("status: { in: ['QUEUED', 'FAILED'] }");
    expect(source).toContain("data: { status: 'SENDING', errorCode: null }");
    expect(source).toContain('providerError.retryable && !exhausted');
  });
});
