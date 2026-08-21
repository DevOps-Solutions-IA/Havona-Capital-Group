import { BadRequestException } from '@nestjs/common';
import { HenryToolsService } from './henry-tools.service';

describe('HenryToolsService Meet governance', () => {
  const meetings = {
    get: jest.fn(),
    join: jest.fn(),
    create: jest.fn(),
    cancel: jest.fn(),
  };
  const service = new HenryToolsService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    meetings as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  const context = {
    conversationId: '00000000-0000-4000-8000-000000000001',
    audit: {},
    actor: {
      id: 'consultant',
      roles: ['CONSULTOR'],
      permissions: ['meeting.read', 'meeting.join', 'meeting.create', 'meeting.manage_own'],
    },
  } as any;

  beforeEach(() => jest.clearAllMocks());

  it('delega lecturas con el actor server-side y el meetingId validado', async () => {
    const meetingId = '00000000-0000-4000-8000-000000000002';
    meetings.get.mockResolvedValue({ id: meetingId });
    meetings.join.mockResolvedValue({ url: 'https://meet.invalid/room' });

    await service.execute('get_meeting', { meetingId }, context);
    await service.execute('get_meeting_join_info', { meetingId }, context);

    expect(meetings.get).toHaveBeenCalledWith(context.actor, meetingId);
    expect(meetings.join).toHaveBeenCalledWith(context.actor, meetingId, context.audit);
  });

  it.each([
    [
      'create_meeting_for_calendar_event',
      {
        calendarEventLinkId: '00000000-0000-4000-8000-000000000003',
        title: 'Cita consultiva',
        scheduledStartAt: '2030-01-01T10:00:00.000Z',
        scheduledEndAt: '2030-01-01T11:00:00.000Z',
        timezone: 'America/Bogota',
        confirmedByUser: false,
        idempotencyKey: '00000000-0000-4000-8000-000000000004',
      },
    ],
    [
      'cancel_meeting',
      {
        meetingId: '00000000-0000-4000-8000-000000000002',
        reason: 'Cambio de agenda',
        confirmedByUser: false,
      },
    ],
  ])('bloquea %s sin confirmación explícita', async (tool, input) => {
    await expect(service.execute(tool, input, context)).rejects.toBeInstanceOf(BadRequestException);
    expect(meetings.create).not.toHaveBeenCalled();
    expect(meetings.cancel).not.toHaveBeenCalled();
  });

  it('delega creación confirmada conservando actor, cita e idempotencia', async () => {
    const input = {
      calendarEventLinkId: '00000000-0000-4000-8000-000000000003',
      title: 'Cita consultiva',
      scheduledStartAt: '2030-01-01T10:00:00.000Z',
      scheduledEndAt: '2030-01-01T11:00:00.000Z',
      timezone: 'America/Bogota',
      confirmedByUser: true,
      idempotencyKey: '00000000-0000-4000-8000-000000000004',
    };
    meetings.create.mockResolvedValue({ id: 'meeting-created' });

    await service.execute('create_meeting_for_calendar_event', input, context);

    expect(meetings.create).toHaveBeenCalledWith(
      context.actor,
      expect.objectContaining({ calendarEventLinkId: input.calendarEventLinkId }),
      input.idempotencyKey,
      context.audit,
    );
  });
});
