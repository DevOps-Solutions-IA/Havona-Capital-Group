import { MeetingConfig } from './meeting-config';
import { JitsiMeetingProvider } from './jitsi-meeting.provider';
describe('JitsiMeetingProvider', () => {
  const config = {
    assertConfigured: jest.fn(),
    baseUrl: 'https://meet.havona.test',
    domain: 'meet.havona.test',
    appId: 'havona',
    appSecret: 'never-log-this-secret',
    jwtEnabled: true,
    tokenTtl: 3600,
    guestTokenTtl: 900,
  } as unknown as MeetingConfig;
  const provider = new JitsiMeetingProvider(config);
  const now = Date.now(),
    meeting = {
      roomName: 'havona-random-room',
      title: 'Consulta',
      scheduledStartAt: new Date(now - 60000),
      scheduledEndAt: new Date(now + 3600000),
      status: 'SCHEDULED',
      lobbyRequired: true,
      allowGuestBeforeHost: false,
      joinEarlyMinutes: 15,
      joinLateMinutes: 30,
    };
  it('genera configuración firmada sin exponer el secreto', async () => {
    const join = await provider.getJoinConfiguration(meeting, {
      id: 'u1',
      name: 'Consultor',
      role: 'HOST',
    });
    expect(join.url).toBe('https://meet.havona.test/havona-random-room');
    expect(join.jwt?.split('.')).toHaveLength(3);
    expect(JSON.stringify(join)).not.toContain('never-log-this-secret');
    const payload = JSON.parse(Buffer.from(join.jwt!.split('.')[1]!, 'base64url').toString());
    expect(payload.context.user.moderator).toBe(true);
  });
  it('limita privilegios de invitado', async () => {
    const join = await provider.getJoinConfiguration(meeting, {
      id: 'g1',
      name: 'Invitado',
      role: 'GUEST',
    });
    const payload = JSON.parse(Buffer.from(join.jwt!.split('.')[1]!, 'base64url').toString());
    expect(payload.context.user.moderator).toBe(false);
  });
  it('rechaza cancelada, anticipada y expirada', () => {
    expect(() => provider.validateMeetingAccess({ ...meeting, status: 'CANCELLED' })).toThrow(
      expect.objectContaining({ code: 'MEETING_CANCELLED' }),
    );
    expect(() =>
      provider.validateMeetingAccess(
        {
          ...meeting,
          scheduledStartAt: new Date(now + 3600000),
          scheduledEndAt: new Date(now + 7200000),
        },
        new Date(now),
      ),
    ).toThrow(expect.objectContaining({ code: 'MEETING_NOT_STARTED' }));
    expect(() =>
      provider.validateMeetingAccess(
        {
          ...meeting,
          scheduledStartAt: new Date(now - 7200000),
          scheduledEndAt: new Date(now - 3600000),
        },
        new Date(now),
      ),
    ).toThrow(expect.objectContaining({ code: 'MEETING_EXPIRED' }));
  });
});
