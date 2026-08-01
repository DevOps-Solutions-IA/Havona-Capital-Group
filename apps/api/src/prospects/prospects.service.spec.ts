import { CaptureProspectInput } from '@havona/contracts';
import { LeadEventType, ProspectStatus } from '@havona/database';
import { ProspectsService } from './prospects.service';

describe('ProspectsService', () => {
  const input: CaptureProspectInput = {
    submissionId: '7e3e371d-e3cb-4380-bd67-9acb5709cc72',
    name: 'Persona Interesada', phone: '+57 300 123 4567', email: 'persona@example.com',
    city: 'Bogotá', source: 'organic', landing: 'pension', interest: 'pension',
    consent: { accepted: true, privacyVersion: 'v1' },
  };

  it('persiste captura, consentimiento, evento y auditoría sin PII en metadata', async () => {
    const prospect = { id: '34c4d674-6984-49df-a7a0-cc9e96e8f971', status: ProspectStatus.NEW };
    const tx = {
      leadEvent: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
      leadSource: { findFirst: jest.fn().mockResolvedValue({ id: 'source-id' }) },
      prospect: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(prospect) },
      consent: { create: jest.fn().mockResolvedValue({}) },
    };
    const db = { $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)) } as any;
    const audit = { record: jest.fn().mockResolvedValue({}) } as any;
    const service = new ProspectsService(db, audit);

    await expect(service.capture(input, { ipAddress: '127.0.0.1', userAgent: 'test' })).resolves.toEqual(prospect);
    expect(tx.consent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ accepted: true, privacyVersion: 'v1' }) });
    expect(tx.leadEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ submissionId: input.submissionId, type: LeadEventType.CAPTURED }) });
    expect(audit.record).toHaveBeenCalledWith('PROSPECT_CAPTURED', 'Prospect', prospect.id, expect.anything(), {
      source: 'organic', landing: 'pension', eventType: LeadEventType.CAPTURED,
    }, tx);
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain(input.email);
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain(input.phone);
  });

  it('rechaza una colisión cruzada sin fusionar identidades ni crear datos parciales', async () => {
    const tx = {
      leadEvent: { findUnique: jest.fn().mockResolvedValue(null) },
      leadSource: { findFirst: jest.fn().mockResolvedValue({ id: 'source-id' }) },
      prospect: { findMany: jest.fn().mockResolvedValue([{ id: 'prospect-email' }, { id: 'prospect-phone' }]) },
      consent: { create: jest.fn() },
    };
    const db = { $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)) } as any;
    const service = new ProspectsService(db, { record: jest.fn() } as any);
    await expect(service.capture(input, {})).rejects.toThrow('No fue posible consolidar');
    expect(tx.consent.create).not.toHaveBeenCalled();
  });
});
