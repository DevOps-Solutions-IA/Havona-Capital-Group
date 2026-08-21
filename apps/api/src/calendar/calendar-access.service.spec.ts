import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CalendarAccessService } from './calendar-access.service';

const actor = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'actor',
    roles: ['CONSULTOR'],
    permissions: ['calendar.read', 'calendar.manage_own'],
    ...overrides,
  }) as any;
const db = () => ({
  calendarTeamMembership: { findUnique: jest.fn(), upsert: jest.fn(), delete: jest.fn() },
  user: { findFirst: jest.fn(), findMany: jest.fn() },
  prospect: { findFirst: jest.fn() },
  company: { findFirst: jest.fn() },
  opportunity: { findFirst: jest.fn() },
  conversation: { findFirst: jest.fn() },
  companyContact: { findUnique: jest.fn() },
});

describe('CalendarAccessService', () => {
  it('mantiene al CONSULTOR limitado a su propia agenda', async () => {
    const service = new CalendarAccessService(db() as any, { record: jest.fn() } as any);
    await expect(service.assertUserScope(actor(), 'actor')).resolves.toBeUndefined();
    await expect(service.assertUserScope(actor(), 'other')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('permite al GERENTE únicamente miembros explícitos de su equipo', async () => {
    const database = db();
    const service = new CalendarAccessService(database as any, { record: jest.fn() } as any);
    const manager = actor({ roles: ['GERENTE'], permissions: ['calendar.manage_team'] });
    database.calendarTeamMembership.findUnique
      .mockResolvedValueOnce({ id: 'membership' })
      .mockResolvedValueOnce(null);
    await expect(service.assertUserScope(manager, 'consultant-a')).resolves.toBeUndefined();
    await expect(service.assertUserScope(manager, 'consultant-b')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('permite alcance administrativo sin convertir userId en confianza del cliente', async () => {
    const database = db();
    const service = new CalendarAccessService(database as any, { record: jest.fn() } as any);
    database.user.findFirst.mockResolvedValueOnce({ id: 'consultant' }).mockResolvedValueOnce(null);
    const admin = actor({ roles: ['ADMIN'], permissions: ['calendar.manage_team'] });
    await expect(service.assertUserScope(admin, 'consultant')).resolves.toBeUndefined();
    await expect(service.assertUserScope(admin, 'unknown')).rejects.toThrow(
      'Usuario de agenda no encontrado',
    );
  });

  it.each(['ADMIN', 'SUPER_ADMIN'])(
    '%s obtiene alcance global únicamente con manage_team',
    async (role) => {
      const database = db();
      database.user.findFirst.mockResolvedValue({ id: 'consultant' });
      const service = new CalendarAccessService(database as any, { record: jest.fn() } as any);
      await expect(
        service.assertUserScope(
          actor({ roles: [role], permissions: ['calendar.manage_team'] }),
          'consultant',
        ),
      ).resolves.toBeUndefined();
    },
  );

  it('impide que un GERENTE defina su propio ámbito', async () => {
    const service = new CalendarAccessService(db() as any, { record: jest.fn() } as any);
    const manager = actor({
      roles: ['GERENTE'],
      permissions: ['calendar.manage_team', 'users.update'],
    });
    await expect(
      service.assignTeamMember(manager, 'actor', 'consultant', {} as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bloquea IDOR independiente de empresa, oportunidad y conversación', async () => {
    const database = db();
    const service = new CalendarAccessService(database as any, { record: jest.fn() } as any);
    database.prospect.findFirst.mockResolvedValue({ id: 'prospect' });
    database.company.findFirst.mockResolvedValue(null);
    database.opportunity.findFirst.mockResolvedValue(null);
    database.conversation.findFirst.mockResolvedValue(null);
    await expect(
      service.authorizeRelations(actor(), { companyId: 'company' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.authorizeRelations(actor(), { opportunityId: 'opportunity' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.authorizeRelations(actor(), { conversationId: 'conversation' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rechaza relaciones CRM inconsistentes aunque cada UUID sea accesible', async () => {
    const database = db();
    const service = new CalendarAccessService(database as any, { record: jest.fn() } as any);
    database.prospect.findFirst.mockResolvedValue({ id: 'prospect-a' });
    database.opportunity.findFirst.mockResolvedValue({
      id: 'opportunity',
      prospectId: 'prospect-b',
    });
    await expect(
      service.authorizeRelations(actor(), {
        prospectId: 'prospect-a',
        opportunityId: 'opportunity',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    database.opportunity.findFirst.mockResolvedValue(null);
    database.company.findFirst.mockResolvedValue({ id: 'company' });
    database.companyContact.findUnique.mockResolvedValue(null);
    await expect(
      service.authorizeRelations(actor(), { prospectId: 'prospect-a', companyId: 'company' }),
    ).rejects.toThrow('La empresa no está relacionada');
  });

  it('distingue propietario de calendario y consultor asignado', async () => {
    const database = db();
    const service = new CalendarAccessService(database as any, { record: jest.fn() } as any);
    database.user.findFirst.mockResolvedValue({ id: 'actor' });
    await expect(service.resolveAssignedConsultant(actor(), undefined, 'actor')).resolves.toBe(
      'actor',
    );
    await expect(
      service.resolveAssignedConsultant(actor(), 'other', 'actor'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
