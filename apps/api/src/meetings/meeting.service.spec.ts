import { ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { MeetingService } from './meeting.service';
describe('MeetingService RBAC y dominio', () => {
  const db: any = {
    meeting: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    meetingAttendanceEvent: { upsert: jest.fn() },
    calendarEventLink: { findUnique: jest.fn() },
    meetingParticipant: { findUnique: jest.fn() },
    meetingInvitation: { findUnique: jest.fn(), update: jest.fn() },
    user: { findUniqueOrThrow: jest.fn() },
  };
  const access: any = {
    assertUserScope: jest.fn(),
    authorizeRelations: jest.fn(),
    resolveAssignedConsultant: jest.fn(),
  };
  const audit: any = { record: jest.fn() };
  const config: any = { prefix: 'havona' };
  const provider: any = {
    createMeeting: jest.fn(),
    validateMeetingAccess: jest.fn(),
    getJoinConfiguration: jest.fn(),
    cancelMeeting: jest.fn(),
  };
  const service = new MeetingService(db, access, audit, config, provider);
  beforeEach(() => {
    jest.clearAllMocks();
    access.assertUserScope.mockReset().mockResolvedValue(undefined);
    access.authorizeRelations.mockReset().mockResolvedValue(undefined);
    access.resolveAssignedConsultant.mockReset().mockResolvedValue(undefined);
  });
  it('publica MEETING_ENDED con eventId del webhook idempotente', async () => {
    const eventBus = { publish: jest.fn() };
    const localConfig: any = { prefix: 'havona', webhookSecret: 'webhook-secret' };
    const local = new MeetingService(db, access, audit, localConfig, provider, eventBus as any);
    db.meeting.findUnique.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      prospectId: '00000000-0000-4000-8000-000000000002',
      opportunityId: null,
      ownerUserId: '00000000-0000-4000-8000-000000000003',
      assignedConsultantId: null,
    });
    db.meetingAttendanceEvent.upsert.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000004',
    });
    db.meeting.update.mockResolvedValue({});
    await local.providerEvent('webhook-secret', {
      meetingId: '00000000-0000-4000-8000-000000000001',
      providerEventId: 'provider-event-ended',
      type: 'ENDED',
      occurredAt: '2030-01-01T10:00:00.000Z',
    });
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'meeting:ended:provider-event-ended',
        type: 'MEETING_ENDED',
        payload: expect.objectContaining({
          assignedUserId: '00000000-0000-4000-8000-000000000003',
        }),
      }),
    );
  });
  it('CONSULTOR no puede leer calendario de otro consultor', async () => {
    access.assertUserScope.mockRejectedValue(new ForbiddenException());
    await expect(
      service.list({ id: 'self', permissions: ['meeting.read'] }, { ownerUserId: 'other' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('GERENTE delega el ámbito de equipo a CalendarAccessService', async () => {
    db.meeting.findMany.mockResolvedValue([]);
    await service.team(
      { id: 'manager', roles: ['GERENTE'], permissions: ['meeting.read', 'meeting.manage_team'] },
      { ownerUserId: 'member' },
    );
    expect(access.assertUserScope).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'manager' }),
      'member',
    );
  });
  it('permite lectura OWN sin ampliar el ámbito', async () => {
    db.meeting.findUnique.mockResolvedValue({
      id: 'meeting-own',
      ownerUserId: 'consultant',
      participants: [],
    });
    await service.get({ id: 'consultant', permissions: ['meeting.read'] }, 'meeting-own');
    expect(access.assertUserScope).not.toHaveBeenCalled();
  });
  it('valida TEAM y GLOBAL mediante el scope autoritativo', async () => {
    db.meeting.findUnique.mockResolvedValue({
      id: 'meeting-team',
      ownerUserId: 'team-member',
      participants: [],
    });
    await service.get(
      { id: 'manager', roles: ['GERENTE'], permissions: ['meeting.read', 'meeting.manage_team'] },
      'meeting-team',
    );
    expect(access.assertUserScope).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'manager' }),
      'team-member',
    );
    access.assertUserScope.mockClear();
    await service.get(
      { id: 'admin', roles: ['SUPER_ADMIN'], permissions: ['meeting.read'] },
      'meeting-team',
    );
    expect(access.assertUserScope).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'admin' }),
      'team-member',
    );
  });
  it('bloquea meetingId manipulado o de otro consultor', async () => {
    db.meeting.findUnique.mockResolvedValue({
      id: 'meeting-other',
      ownerUserId: 'other',
      participants: [],
    });
    access.assertUserScope.mockRejectedValue(new ForbiddenException('Fuera de ámbito'));
    await expect(
      service.get({ id: 'consultant', permissions: ['meeting.read'] }, 'meeting-other'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('bloquea cancelación sin permiso de gestión aunque conozca el meetingId', async () => {
    db.meeting.findUnique.mockResolvedValue({
      id: 'meeting-other',
      ownerUserId: 'other',
      participants: [],
    });
    await expect(
      service.cancel(
        { id: 'consultant', permissions: ['meeting.read'] },
        'meeting-other',
        'Manipulación',
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(provider.cancelMeeting).not.toHaveBeenCalled();
  });
  it('rechaza relación CRM no autorizada antes de persistir', async () => {
    db.meeting.findUnique.mockResolvedValue(null);
    access.authorizeRelations.mockRejectedValue(new ForbiddenException());
    await expect(
      service.create(
        { id: 'actor', permissions: ['meeting.create'] },
        {
          title: 'Reunión',
          scheduledStartAt: new Date(Date.now() + 3600000).toISOString(),
          scheduledEndAt: new Date(Date.now() + 7200000).toISOString(),
          timezone: 'America/Bogota',
          prospectId: 'cross',
        },
        'key',
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(provider.createMeeting).not.toHaveBeenCalled();
  });
  it('rechaza calendarEventLink ajeno antes de crear la reunión', async () => {
    db.meeting.findUnique.mockResolvedValue(null);
    db.calendarEventLink.findUnique.mockResolvedValue({
      id: 'calendar-other',
      connection: { userId: 'other' },
      prospectId: null,
      companyId: null,
      opportunityId: null,
      conversationId: null,
    });
    access.assertUserScope.mockRejectedValue(new ForbiddenException('Cita fuera de ámbito'));
    await expect(
      service.create(
        { id: 'consultant', permissions: ['meeting.create'] },
        {
          title: 'Reunión',
          scheduledStartAt: new Date(Date.now() + 3600000).toISOString(),
          scheduledEndAt: new Date(Date.now() + 7200000).toISOString(),
          timezone: 'America/Bogota',
          calendarEventLinkId: 'calendar-other',
        },
        'calendar-scope-key',
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(provider.createMeeting).not.toHaveBeenCalled();
  });
  it('consume una invitación pública al emitir un JWT GUEST', async () => {
    const token = 'guest-certification-token-1234567890';
    const tokenHash = createHash('sha256').update(token).digest('hex');

    db.meetingInvitation.findUnique.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000010',
      meetingId: '00000000-0000-4000-8000-000000000011',
      tokenHash,
      status: 'ACTIVE',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60000),
      expectedEmail: null,
      displayName: 'Invitado HAVONA',
      meeting: {
        id: '00000000-0000-4000-8000-000000000011',
        providerMeetingId: 'havona-secure-room',
        title: 'HAVONA Meet',
        scheduledStartAt: new Date(Date.now() - 60000),
        scheduledEndAt: new Date(Date.now() + 3600000),
        status: 'ACTIVE',
        lobbyRequired: true,
        allowGuestBeforeHost: false,
        joinEarlyMinutes: 15,
        joinLateMinutes: 30,
      },
    });

    provider.getJoinConfiguration.mockResolvedValue({
      url: 'https://meet.havonacapitalgroup.com/havona-secure-room',
      domain: 'meet.havonacapitalgroup.com',
      roomName: 'havona-secure-room',
      jwt: 'guest-jwt',
      role: 'GUEST',
      displayName: 'Invitado HAVONA',
    });

    const result = await service.guestJoin(token, undefined, {});

    expect(result).toMatchObject({
      role: 'GUEST',
      roomName: 'havona-secure-room',
    });

    expect(provider.validateMeetingAccess).toHaveBeenCalled();

    expect(db.meetingInvitation.update).toHaveBeenCalledWith({
      where: { id: '00000000-0000-4000-8000-000000000010' },
      data: {
        usedAt: expect.any(Date),
        status: 'USED',
      },
    });
  });

  it('conserva actor, propietario y consultor asignado separados', async () => {
    db.meeting.findUnique.mockResolvedValue(null);
    access.resolveAssignedConsultant.mockResolvedValue('consultant');
    provider.createMeeting.mockResolvedValue({ providerMeetingId: 'havona-secure' });
    db.meeting.create.mockImplementation(({ data }: any) => data);
    const result: any = await service.create(
      { id: 'manager', permissions: ['meeting.create', 'meeting.manage_team'] },
      {
        title: 'Reunión',
        scheduledStartAt: new Date(Date.now() + 3600000).toISOString(),
        scheduledEndAt: new Date(Date.now() + 7200000).toISOString(),
        timezone: 'America/Bogota',
        ownerUserId: 'owner',
        assignedConsultantId: 'consultant',
      },
      'unique-key',
      {},
    );
    expect(result).toMatchObject({
      createdById: 'manager',
      ownerUserId: 'owner',
      assignedConsultantId: 'consultant',
    });
  });
});
