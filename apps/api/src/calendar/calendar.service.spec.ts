import { CalendarService } from './calendar.service';

describe('CalendarService como núcleo corporativo', () => {
  const actor = {
    id: 'consultant',
    roles: ['CONSULTOR'],
    permissions: ['calendar.read', 'calendar.manage_own'],
  };

  it('conserva la agenda propia y muestra eventos externos sin crear relaciones CRM falsas', async () => {
    const external = {
      id: 'google-external',
      title: 'Evento externo',
      start: '2026-08-04T14:00:00Z',
      end: '2026-08-04T15:00:00Z',
      timezone: 'America/Bogota',
      status: 'confirmed',
    };
    const db = {
      calendarConnection: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'connection',
          userId: actor.id,
          selectedCalendarId: 'primary',
          timezone: 'America/Bogota',
          encryptedAccessToken: 'encrypted',
          accessTokenExpiresAt: new Date(Date.now() + 60_000),
        }),
      },
      calendarEventLink: { findUnique: jest.fn() },
    } as any;
    const provider = { listEvents: jest.fn().mockResolvedValue({ events: [external] }) } as any;
    const access = { assertUserScope: jest.fn().mockResolvedValue(undefined) } as any;
    const service = new CalendarService(
      db,
      {} as any,
      { decrypt: jest.fn().mockReturnValue('token') } as any,
      provider,
      {} as any,
      access,
    );

    const result = await service.listEvents(actor, {});
    expect(result.data).toEqual([external]);
    expect(access.assertUserScope).toHaveBeenCalledWith(actor, actor.id);
    expect(db.calendarEventLink.findUnique).not.toHaveBeenCalled();
  });

  it('persiste creador, propietario de calendario y consultor asignado como responsabilidades distintas', async () => {
    const ownerConnection = {
      id: 'owner-connection',
      userId: 'consultant-owner',
      selectedCalendarId: 'primary',
      timezone: 'America/Bogota',
      encryptedAccessToken: 'encrypted',
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60_000),
    };
    const db = {
      calendarConnection: {
        findFirst: jest.fn().mockResolvedValue(ownerConnection),
        findUniqueOrThrow: jest.fn().mockResolvedValue(ownerConnection),
      },
      calendarMutation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'mutation' }),
        update: jest.fn(),
      },
      calendarEventLink: {
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'link', ...data, connection: ownerConnection })),
      },
      $transaction: jest.fn().mockImplementation((callback) => callback(db)),
    } as any;
    const providerEvent = {
      id: 'google-event',
      title: 'Consulta',
      start: '2026-08-10T15:00:00Z',
      end: '2026-08-10T16:00:00Z',
      timezone: 'America/Bogota',
      status: 'confirmed',
      attendees: [],
    };
    const provider = { createEvent: jest.fn().mockResolvedValue(providerEvent) } as any;
    const access = {
      assertUserScope: jest.fn().mockResolvedValue(undefined),
      authorizeRelations: jest.fn().mockResolvedValue(undefined),
      resolveAssignedConsultant: jest.fn().mockResolvedValue('consultant-owner'),
    } as any;
    const service = new CalendarService(
      db,
      { allowMeet: false } as any,
      { decrypt: jest.fn().mockReturnValue('token') } as any,
      provider,
      { record: jest.fn() } as any,
      access,
    );
    jest.spyOn(service as any, 'assertAvailable').mockResolvedValue(undefined);

    const result = await service.createEvent(
      {
        id: 'manager',
        roles: ['GERENTE'],
        permissions: ['calendar.manage_own', 'calendar.manage_team'],
      },
      {
        title: 'Consulta',
        start: providerEvent.start,
        end: providerEvent.end,
        timezone: providerEvent.timezone,
        attendees: [],
        calendarOwnerUserId: 'consultant-owner',
        assignedConsultantId: 'consultant-owner',
      },
      'calendar-core-owner-test',
      { actorUserId: 'manager' },
    );
    expect(db.calendarEventLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          connectionId: 'owner-connection',
          createdById: 'manager',
          assignedConsultantId: 'consultant-owner',
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        createdById: 'manager',
        calendarOwnerUserId: 'consultant-owner',
        assignedConsultantId: 'consultant-owner',
      }),
    );
  });
});
