import { ForbiddenException } from '@nestjs/common';
import { MeetingService } from './meeting.service';
describe('MeetingService RBAC y dominio', () => {
  const db: any = {
    meeting: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    calendarEventLink: { findUnique: jest.fn() },
    meetingParticipant: { findUnique: jest.fn() },
    meetingInvitation: { findUnique: jest.fn() },
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
  };
  const service = new MeetingService(db, access, audit, config, provider);
  beforeEach(() => {
    jest.clearAllMocks();
    access.assertUserScope.mockReset().mockResolvedValue(undefined);
    access.authorizeRelations.mockReset().mockResolvedValue(undefined);
    access.resolveAssignedConsultant.mockReset().mockResolvedValue(undefined);
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
