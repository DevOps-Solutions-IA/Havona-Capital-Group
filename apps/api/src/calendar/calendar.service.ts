import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivityType, Prisma } from '@havona/database';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { DateTime, IANAZone, Interval } from 'luxon';
import { AuditContext, AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma.service';
import { CalendarConfig } from './calendar-config';
import {
  CALENDAR_PROVIDER,
  CalendarError,
  CalendarEvent,
  CalendarProvider,
  CreateCalendarEvent,
} from './calendar.types';
import { CalendarTokenVault } from './token-vault.service';
import { CalendarAccessService, CalendarActor } from './calendar-access.service';
import { MeetingService } from '../meetings/meeting.service';

type Actor = CalendarActor;
type EventInput = CreateCalendarEvent & {
  prospectId?: string;
  companyId?: string;
  opportunityId?: string;
  conversationId?: string;
  calendarOwnerUserId?: string;
  assignedConsultantId?: string;
  sendUpdates?: 'all' | 'externalOnly' | 'none';
};

@Injectable()
export class CalendarService {
  constructor(
    private readonly db: PrismaService,
    private readonly config: CalendarConfig,
    private readonly vault: CalendarTokenVault,
    @Inject(CALENDAR_PROVIDER) private readonly provider: CalendarProvider,
    private readonly audit: AuditService,
    private readonly access: CalendarAccessService,
    private readonly meetings: MeetingService,
  ) {}

  async beginOAuth(actor: Actor) {
    this.config.assertConfigured();
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    await this.db.calendarOAuthState.create({
      data: {
        stateHash: hash(state),
        userId: actor.id,
        encryptedCodeVerifier: this.vault.encrypt(verifier),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    const query = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.config.scopes.join(' '),
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    return { authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${query}` };
  }

  async completeOAuth(code: string, state: string, audit: AuditContext) {
    this.config.assertConfigured();
    const record = await this.db.calendarOAuthState.findUnique({
      where: { stateHash: hash(state) },
    });
    if (!record || record.consumedAt || record.expiresAt < new Date())
      throw new CalendarError(
        'CALENDAR_AUTH_STATE_INVALID',
        'La autorización expiró o no es válida',
        400,
      );
    await this.db.calendarOAuthState.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
    const tokens = await this.tokenRequest({
      code,
      code_verifier: this.vault.decrypt(record.encryptedCodeVerifier),
      grant_type: 'authorization_code',
      redirect_uri: this.config.redirectUri,
    });
    const calendars = await this.provider.getCalendars({ accessToken: tokens.access_token });
    const primary = calendars.find((item) => item.primary) ?? calendars[0];
    if (!primary)
      throw new CalendarError(
        'CALENDAR_PERMISSION_DENIED',
        'Google no devolvió un calendario accesible',
        403,
      );
    const connection = await this.db.calendarConnection.upsert({
      where: {
        provider_providerAccountId_userId: {
          provider: 'GOOGLE',
          providerAccountId: primary.id,
          userId: record.userId,
        },
      },
      update: {
        accountEmail: primary.id,
        selectedCalendarId: primary.id,
        selectedCalendarName: primary.name,
        timezone: primary.timezone ?? this.config.timezone,
        encryptedAccessToken: this.vault.encrypt(tokens.access_token),
        ...(tokens.refresh_token
          ? { encryptedRefreshToken: this.vault.encrypt(tokens.refresh_token) }
          : {}),
        accessTokenExpiresAt: new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000),
        grantedScopes: String(tokens.scope ?? this.config.scopes.join(' ')).split(' '),
        status: 'ACTIVE',
        disconnectedAt: null,
        lastErrorCode: null,
      },
      create: {
        userId: record.userId,
        providerAccountId: primary.id,
        accountEmail: primary.id,
        selectedCalendarId: primary.id,
        selectedCalendarName: primary.name,
        timezone: primary.timezone ?? this.config.timezone,
        encryptedAccessToken: this.vault.encrypt(tokens.access_token),
        encryptedRefreshToken: tokens.refresh_token
          ? this.vault.encrypt(tokens.refresh_token)
          : null,
        accessTokenExpiresAt: new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000),
        grantedScopes: String(tokens.scope ?? this.config.scopes.join(' ')).split(' '),
      },
    });
    await this.db.calendarAvailabilityRule.upsert({
      where: { userId: record.userId },
      update: {},
      create: {
        userId: record.userId,
        ...(await this.defaultRules()),
        timezone: connection.timezone,
      },
    });
    await this.audit.record(
      'CALENDAR_CONNECTED',
      'CalendarConnection',
      connection.id,
      { ...audit, actorUserId: record.userId },
      { provider: 'GOOGLE', scopes: connection.grantedScopes },
    );
    return connection.id;
  }

  async status(actor: Actor) {
    const connection = await this.connection(actor.id, false);
    if (!connection) return { status: 'DISCONNECTED', enabled: this.config.enabled };
    return {
      id: connection.id,
      provider: connection.provider,
      status: connection.status,
      accountEmail: connection.accountEmail,
      calendarId: connection.selectedCalendarId,
      calendarName: connection.selectedCalendarName,
      timezone: connection.timezone,
      lastSyncedAt: connection.lastSyncedAt,
      enabled: this.config.enabled,
    };
  }

  async calendars(actor: Actor) {
    const connection = await this.requireConnection(actor.id);
    return this.provider.getCalendars(await this.credentials(connection));
  }
  async selectCalendar(actor: Actor, calendarId: string, ctx: AuditContext) {
    const connection = await this.requireConnection(actor.id);
    const calendars = await this.provider.getCalendars(await this.credentials(connection));
    const selected = calendars.find((item) => item.id === calendarId);
    if (!selected) throw new NotFoundException('Calendario no disponible');
    const updated = await this.db.calendarConnection.update({
      where: { id: connection.id },
      data: {
        selectedCalendarId: selected.id,
        selectedCalendarName: selected.name,
        timezone: selected.timezone ?? connection.timezone,
      },
    });
    await this.db.calendarSyncState.deleteMany({ where: { connectionId: connection.id } });
    await this.audit.record('CALENDAR_SELECTED', 'CalendarConnection', connection.id, ctx, {
      calendarId: selected.id,
    });
    return this.status(actor);
  }

  async disconnect(actor: Actor, ctx: AuditContext) {
    const connection = await this.requireConnection(actor.id);
    const credentials = await this.credentials(connection);
    const channels = await this.db.calendarWebhookChannel.findMany({
      where: { connectionId: connection.id, stoppedAt: null },
    });
    for (const channel of channels)
      if (channel.resourceId)
        await this.provider
          .stopWatch(credentials, channel.channelId, channel.resourceId)
          .catch(() => undefined);
    const refresh = connection.encryptedRefreshToken
      ? this.vault.decrypt(connection.encryptedRefreshToken)
      : undefined;
    const access = this.vault.decrypt(connection.encryptedAccessToken);
    await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh ?? access)}`,
      { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' } },
    ).catch(() => undefined);
    await this.db.$transaction([
      this.db.calendarWebhookChannel.updateMany({
        where: { connectionId: connection.id, stoppedAt: null },
        data: { stoppedAt: new Date() },
      }),
      this.db.calendarConnection.update({
        where: { id: connection.id },
        data: {
          encryptedAccessToken: '',
          encryptedRefreshToken: null,
          status: 'DISCONNECTED',
          disconnectedAt: new Date(),
        },
      }),
    ]);
    await this.audit.record('CALENDAR_DISCONNECTED', 'CalendarConnection', connection.id, ctx);
    return { status: 'DISCONNECTED' };
  }

  async getRules(actor: Actor) {
    return this.db.calendarAvailabilityRule.upsert({
      where: { userId: actor.id },
      update: {},
      create: { userId: actor.id, ...(await this.defaultRules()) },
    });
  }
  async updateRules(actor: Actor, input: any, ctx: AuditContext) {
    this.assertTimezone(input.timezone);
    const start = this.clock(input.workStart),
      end = this.clock(input.workEnd);
    if (start >= end)
      throw new BadRequestException('El horario de inicio debe ser anterior al final');
    const rule = await this.db.calendarAvailabilityRule.upsert({
      where: { userId: actor.id },
      update: input,
      create: { userId: actor.id, ...input },
    });
    await this.audit.record('CALENDAR_RULES_UPDATED', 'CalendarAvailabilityRule', rule.id, ctx, {
      fields: Object.keys(input),
    });
    return rule;
  }

  async availability(
    actor: Actor,
    input: { timeMin: string; timeMax: string; timezone: string; durationMinutes: number },
    ignoredBusy?: { start: Date; end: Date },
  ) {
    return this.availabilityForUser(actor, actor.id, input, ignoredBusy);
  }

  async teamMembers(actor: Actor) {
    return this.access.teamMembers(actor);
  }
  async assignTeamMember(actor: Actor, managerId: string, memberId: string, ctx: AuditContext) {
    return this.access.assignTeamMember(actor, managerId, memberId, ctx);
  }
  async removeTeamMember(actor: Actor, managerId: string, memberId: string, ctx: AuditContext) {
    return this.access.removeTeamMember(actor, managerId, memberId, ctx);
  }
  async teamAvailability(
    actor: Actor,
    userIds: string[],
    input: { timeMin: string; timeMax: string; timezone: string; durationMinutes: number },
  ) {
    const unique = [...new Set(userIds)];
    if (!unique.length || unique.length > 20)
      throw new BadRequestException('Seleccione entre 1 y 20 miembros');
    return {
      members: await Promise.all(
        unique.map(async (userId) => ({
          userId,
          ...(await this.availabilityForUser(actor, userId, input)),
        })),
      ),
    };
  }
  async teamEvents(actor: Actor, userId: string, input: { timeMin?: string; timeMax?: string }) {
    return this.listEventsForUser(actor, userId, input);
  }

  private async availabilityForUser(
    actor: Actor,
    userId: string,
    input: { timeMin: string; timeMax: string; timezone: string; durationMinutes: number },
    ignoredBusy?: { start: Date; end: Date },
  ) {
    this.assertTimezone(input.timezone);
    await this.access.assertUserScope(actor, userId);
    const connection = await this.requireConnection(userId);
    const rules = await this.getRulesForUser(userId);
    const min = DateTime.fromISO(input.timeMin, { setZone: true });
    const max = DateTime.fromISO(input.timeMax, { setZone: true });
    if (
      !min.isValid ||
      !max.isValid ||
      max <= min ||
      max.diff(min, 'days').days > 31 ||
      max > DateTime.utc().plus({ days: rules.maximumFutureBookingDays })
    )
      throw new BadRequestException('Rango de disponibilidad inválido');
    let busy =
      (
        await this.provider.getAvailability(await this.credentials(connection), {
          calendarIds: [connection.selectedCalendarId],
          timeMin: min.toUTC().toISO()!,
          timeMax: max.toUTC().toISO()!,
          timezone: input.timezone,
        })
      )[connection.selectedCalendarId] ?? [];
    if (ignoredBusy)
      busy = busy.filter(
        (range) =>
          new Date(range.start).getTime() !== ignoredBusy.start.getTime() ||
          new Date(range.end).getTime() !== ignoredBusy.end.getTime(),
      );
    const slots = this.findSlots(min, max, input.durationMinutes, rules, busy);
    return {
      timezone: input.timezone,
      durationMinutes: input.durationMinutes,
      slots,
      source: 'GOOGLE_FREEBUSY',
    };
  }

  async listEvents(actor: Actor, input: { timeMin?: string; timeMax?: string }) {
    return this.listEventsForUser(actor, actor.id, input);
  }
  private async listEventsForUser(
    actor: Actor,
    userId: string,
    input: { timeMin?: string; timeMax?: string },
  ) {
    await this.access.assertUserScope(actor, userId);
    const connection = await this.requireConnection(userId);
    const page = await this.provider.listEvents(await this.credentials(connection), {
      calendarId: connection.selectedCalendarId,
      ...input,
    });
    const events = page.events.filter((event) => event.status !== 'cancelled');
    const links = await this.db.calendarEventLink.findMany({
      where: {
        connectionId: connection.id,
        providerEventId: { in: events.map((event) => event.id) },
      },
      select: { providerEventId: true, meeting: { select: { id: true, status: true } } },
    });
    const byProvider = new Map(links.map((link) => [link.providerEventId, link.meeting]));
    return {
      data: events.map((event) => {
        const meeting = byProvider.get(event.id);
        return {
          ...event,
          ...(meeting ? { meetingId: meeting.id, meetingStatus: meeting.status } : {}),
        };
      }),
      timezone: connection.timezone,
    };
  }

  async getLinkedEvent(actor: Actor, id: string) {
    const link = await this.authorizedLink(actor, id);
    return this.provider.getEvent(
      await this.credentials(link.connection),
      link.calendarId,
      link.providerEventId,
    );
  }

  async createEvent(actor: Actor, input: EventInput, idempotencyKey: string, ctx: AuditContext) {
    if (!idempotencyKey || idempotencyKey.length > 120)
      throw new BadRequestException('Idempotency-Key es obligatorio');
    this.assertEventInput(input);
    const ownerId = input.calendarOwnerUserId ?? actor.id;
    await this.access.assertUserScope(actor, ownerId);
    const connection = await this.requireConnection(ownerId);
    await this.access.authorizeRelations(actor, input);
    const assignedConsultantId = await this.access.resolveAssignedConsultant(
      actor,
      input.assignedConsultantId,
      ownerId,
    );
    const normalizedInput = { ...input, assignedConsultantId };
    const existing = await this.db.calendarMutation.findUnique({
      where: { connectionId_idempotencyKey: { connectionId: connection.id, idempotencyKey } },
    });
    if (existing?.status === 'SUCCEEDED') return existing.result;
    if (existing?.status === 'PROCESSING')
      throw new ConflictException('La operación ya está en proceso');
    const mutation = existing
      ? await this.db.calendarMutation.update({
          where: { id: existing.id },
          data: { status: 'PROCESSING', errorCode: null },
        })
      : await this.db.calendarMutation.create({
          data: { connectionId: connection.id, idempotencyKey, operation: 'CREATE' },
        });
    try {
      await this.assertAvailable(
        actor,
        ownerId,
        normalizedInput.start,
        normalizedInput.end,
        normalizedInput.timezone,
      );
      const providerEvent = await this.provider.createEvent(
        await this.credentials(connection),
        connection.selectedCalendarId,
        {
          ...normalizedInput,
          id: createHash('sha256')
            .update(`${connection.id}:${idempotencyKey}`)
            .digest('hex')
            .slice(0, 32),
          createConference: Boolean(normalizedInput.createConference && this.config.allowMeet),
        },
        normalizedInput.sendUpdates ?? 'all',
      );
      const link = await this.persistEvent(connection.id, actor.id, providerEvent, normalizedInput);
      const result = this.presentLink(link);
      await this.db.calendarMutation.update({
        where: { id: mutation.id },
        data: { status: 'SUCCEEDED', result: result as Prisma.InputJsonValue },
      });
      await this.crmEvent('CALENDAR_EVENT_CREATED', actor, normalizedInput, link.id, ctx);
      return result;
    } catch (error) {
      await this.db.calendarMutation.update({
        where: { id: mutation.id },
        data: { status: 'FAILED', errorCode: this.errorCode(error) },
      });
      throw error;
    }
  }

  async updateEvent(
    actor: Actor,
    linkId: string,
    input: Partial<EventInput>,
    idempotencyKey: string,
    ctx: AuditContext,
  ) {
    const link = await this.authorizedLink(actor, linkId);
    const connection = link.connection;
    await this.access.authorizeRelations(actor, input);
    const start = input.start ?? link.startAt.toISOString(),
      end = input.end ?? link.endAt.toISOString(),
      timezone = input.timezone ?? link.timezone;
    this.assertEventInput({
      title: input.title ?? link.title,
      start,
      end,
      timezone,
      attendees: input.attendees ?? [],
      createConference: input.createConference,
    });
    await this.assertAvailable(actor, connection.userId, start, end, timezone, {
      start: link.startAt,
      end: link.endAt,
    });
    return this.mutate(connection.id, idempotencyKey, 'UPDATE', async () => {
      const event = await this.provider.updateEvent(
        await this.credentials(connection),
        link.calendarId,
        link.providerEventId,
        { ...input, start, end, timezone },
        input.sendUpdates ?? 'all',
      );
      const updated = await this.db.calendarEventLink.update({
        where: { id: link.id },
        data: this.eventData(event),
        include: { connection: true },
      });
      await this.meetings.rescheduleFromCalendar(
        link.id,
        updated.startAt,
        updated.endAt,
        updated.timezone,
      );
      await this.crmEvent(
        'CALENDAR_EVENT_UPDATED',
        actor,
        {
          prospectId: link.prospectId ?? undefined,
          opportunityId: link.opportunityId ?? undefined,
        },
        link.id,
        ctx,
        { oldStart: link.startAt, oldEnd: link.endAt },
      );
      return this.presentLink(updated);
    });
  }

  async cancelEvent(
    actor: Actor,
    linkId: string,
    input: { reason: string; sendUpdates?: 'all' | 'externalOnly' | 'none' },
    idempotencyKey: string,
    ctx: AuditContext,
  ) {
    const link = await this.authorizedLink(actor, linkId);
    const connection = link.connection;
    return this.mutate(connection.id, idempotencyKey, 'CANCEL', async () => {
      await this.provider.cancelEvent(
        await this.credentials(connection),
        link.calendarId,
        link.providerEventId,
        input.sendUpdates ?? 'all',
      );
      const updated = await this.db.calendarEventLink.update({
        where: { id: link.id },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: input.reason },
        include: { connection: true },
      });
      await this.meetings.cancelFromCalendar(link.id, input.reason);
      await this.crmEvent(
        'CALENDAR_EVENT_CANCELLED',
        actor,
        {
          prospectId: link.prospectId ?? undefined,
          opportunityId: link.opportunityId ?? undefined,
        },
        link.id,
        ctx,
        { reason: input.reason, previousStart: link.startAt, previousEnd: link.endAt },
      );
      return this.presentLink(updated);
    });
  }

  async sync(actor: Actor) {
    const connection = await this.requireConnection(actor.id);
    return this.syncConnection(connection);
  }
  async startWatch(actor: Actor) {
    if (
      !this.config.webhookUrl ||
      !this.config.webhookUrl.startsWith('https://') ||
      !this.config.webhookSecret
    )
      throw new CalendarError(
        'CALENDAR_CONFIGURATION_REQUIRED',
        'Configure una URL HTTPS y secreto para activar notificaciones push',
        409,
      );
    const connection = await this.requireConnection(actor.id);
    const credentials = await this.credentials(connection);
    const previous = await this.db.calendarWebhookChannel.findMany({
      where: { connectionId: connection.id, stoppedAt: null },
    });
    const channelId = randomUUID();
    const token = `${this.config.webhookSecret}.${randomBytes(24).toString('base64url')}`;
    const expiration = DateTime.utc().plus({ days: 6 }).toISO()!;
    const watch = await this.provider.watchEvents(credentials, {
      calendarId: connection.selectedCalendarId,
      channelId,
      token,
      address: this.config.webhookUrl,
      expiration,
    });
    await this.db.calendarWebhookChannel.create({
      data: {
        connectionId: connection.id,
        channelId: watch.channelId,
        resourceId: watch.resourceId,
        encryptedToken: this.vault.encrypt(token),
        expiration: new Date(watch.expiration),
      },
    });
    for (const item of previous) {
      if (item.resourceId)
        await this.provider
          .stopWatch(credentials, item.channelId, item.resourceId)
          .catch(() => undefined);
      await this.db.calendarWebhookChannel.update({
        where: { id: item.id },
        data: { stoppedAt: new Date() },
      });
    }
    return { active: true, expiration: watch.expiration };
  }
  async stopWatch(actor: Actor) {
    const connection = await this.requireConnection(actor.id);
    const channels = await this.db.calendarWebhookChannel.findMany({
      where: { connectionId: connection.id, stoppedAt: null },
    });
    const credentials = await this.credentials(connection);
    for (const item of channels) {
      if (item.resourceId)
        await this.provider.stopWatch(credentials, item.channelId, item.resourceId);
      await this.db.calendarWebhookChannel.update({
        where: { id: item.id },
        data: { stoppedAt: new Date() },
      });
    }
    return { active: false };
  }
  async webhook(headers: Record<string, string | string[] | undefined>) {
    const channelId = String(headers['x-goog-channel-id'] ?? '');
    const resourceId = String(headers['x-goog-resource-id'] ?? '');
    const token = String(headers['x-goog-channel-token'] ?? '');
    const channel = await this.db.calendarWebhookChannel.findUnique({
      where: { channelId },
      include: { connection: true },
    });
    if (
      !channel ||
      channel.stoppedAt ||
      channel.resourceId !== resourceId ||
      !safeEqual(this.vault.decrypt(channel.encryptedToken), token)
    )
      throw new CalendarError(
        'CALENDAR_WEBHOOK_INVALID',
        'Notificación de calendario inválida',
        403,
      );
    await this.db.calendarWebhookChannel.update({
      where: { id: channel.id },
      data: { lastNotificationAt: new Date() },
    });
    await this.syncConnection(channel.connection);
    return { accepted: true };
  }

  private async syncConnection(connection: any): Promise<{ synced: boolean; full: boolean }> {
    const credentials = await this.credentials(connection);
    const state = await this.db.calendarSyncState.findUnique({
      where: { connectionId: connection.id },
    });
    let token = state?.syncToken ?? undefined,
      full = !token,
      pageToken: string | undefined,
      lastSyncToken: string | undefined;
    try {
      do {
        const page = await this.provider.listEvents(credentials, {
          calendarId: connection.selectedCalendarId,
          syncToken: token,
          pageToken,
          ...(!token ? { timeMin: DateTime.utc().minus({ months: 1 }).toISO()! } : {}),
        });
        for (const event of page.events) await this.upsertSyncedEvent(connection, event);
        pageToken = page.nextPageToken;
        lastSyncToken = page.nextSyncToken ?? lastSyncToken;
      } while (pageToken);
    } catch (error) {
      if (error instanceof CalendarError && error.code === 'CALENDAR_SYNC_TOKEN_EXPIRED') {
        await this.db.calendarSyncState.deleteMany({ where: { connectionId: connection.id } });
        return this.syncConnection(connection);
      }
      throw error;
    }
    await this.db.calendarSyncState.upsert({
      where: { connectionId: connection.id },
      update: {
        syncToken: lastSyncToken,
        lastSyncAt: new Date(),
        lastStatus: 'SUCCEEDED',
        lastErrorCode: null,
        ...(full ? { lastFullSyncAt: new Date() } : {}),
      },
      create: {
        connectionId: connection.id,
        syncToken: lastSyncToken,
        lastSyncAt: new Date(),
        lastFullSyncAt: new Date(),
        lastStatus: 'SUCCEEDED',
      },
    });
    await this.db.calendarConnection.update({
      where: { id: connection.id },
      data: { lastSyncedAt: new Date() },
    });
    return { synced: true, full };
  }

  private async upsertSyncedEvent(connection: any, event: CalendarEvent) {
    const existing = await this.db.calendarEventLink.findUnique({
      where: {
        connectionId_providerEventId: { connectionId: connection.id, providerEventId: event.id },
      },
    });
    if (!existing) return;
    await this.db.calendarEventLink.update({
      where: { id: existing.id },
      data: this.eventData(event),
    });
  }
  private async persistEvent(
    connectionId: string,
    userId: string,
    event: CalendarEvent,
    input: EventInput,
  ) {
    return this.db.calendarEventLink.create({
      data: {
        connectionId,
        providerEventId: event.id,
        calendarId: (
          await this.db.calendarConnection.findUniqueOrThrow({ where: { id: connectionId } })
        ).selectedCalendarId,
        createdById: userId,
        assignedConsultantId: input.assignedConsultantId,
        prospectId: input.prospectId,
        companyId: input.companyId,
        opportunityId: input.opportunityId,
        conversationId: input.conversationId,
        ...this.eventData(event),
      },
      include: { connection: true },
    });
  }
  private eventData(event: CalendarEvent) {
    return {
      providerEtag: event.etag,
      title: event.title,
      startAt: new Date(event.start),
      endAt: new Date(event.end),
      timezone: event.timezone,
      status: event.status.toUpperCase() as any,
      htmlLink: event.htmlLink,
      conferenceLink: event.conferenceLink,
      attendees: event.attendees as Prisma.InputJsonValue,
    };
  }
  private presentLink(link: any) {
    return {
      id: link.id,
      title: link.title,
      start: link.startAt,
      end: link.endAt,
      timezone: link.timezone,
      status: link.status,
      attendees: link.attendees,
      htmlLink: link.htmlLink,
      conferenceLink: link.conferenceLink,
      prospectId: link.prospectId,
      companyId: link.companyId,
      opportunityId: link.opportunityId,
      conversationId: link.conversationId,
      createdById: link.createdById,
      calendarOwnerUserId: link.connection?.userId,
      assignedConsultantId: link.assignedConsultantId,
    };
  }
  private async authorizedLink(actor: Actor, id: string) {
    const link = await this.db.calendarEventLink.findUnique({
      where: { id },
      include: { connection: true },
    });
    if (!link) throw new NotFoundException('Cita no encontrada o fuera de su ámbito');
    await this.access.assertUserScope(actor, link.connection.userId);
    return link;
  }
  private async assertAvailable(
    actor: Actor,
    ownerId: string,
    start: string,
    end: string,
    timezone: string,
    ignoredBusy?: { start: Date; end: Date },
  ) {
    const result = await this.availabilityForUser(
      actor,
      ownerId,
      {
        timeMin: start,
        timeMax: end,
        timezone,
        durationMinutes: Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000),
      },
      ignoredBusy,
    );
    const exact = result.slots.some(
      (slot: any) => new Date(slot.start).getTime() === new Date(start).getTime(),
    );
    if (!exact)
      throw new CalendarError(
        'CALENDAR_CONFLICT',
        'Ese espacio acaba de dejar de estar disponible',
        409,
      );
  }
  private findSlots(
    min: DateTime,
    max: DateTime,
    duration: number,
    rules: any,
    busy: Array<{ start: string; end: string }>,
  ) {
    const zone = rules.timezone;
    const now = DateTime.utc().plus({ minutes: rules.minimumNoticeMinutes });
    const occupied = busy.map((x) =>
      Interval.fromDateTimes(
        DateTime.fromISO(x.start).minus({ minutes: rules.bufferBeforeMinutes }),
        DateTime.fromISO(x.end).plus({ minutes: rules.bufferAfterMinutes }),
      ),
    );
    const slots: Array<{ start: string; end: string }> = [];
    let day = min.setZone(zone).startOf('day');
    const last = max.setZone(zone);
    while (day <= last && slots.length < 50) {
      if (rules.workingDays.includes(day.weekday)) {
        const [sh, sm] = rules.workStart.split(':').map(Number),
          [eh, em] = rules.workEnd.split(':').map(Number);
        let cursor = day.set({ hour: sh, minute: sm });
        const close = day.set({ hour: eh, minute: em });
        while (cursor.plus({ minutes: duration }) <= close) {
          const end = cursor.plus({ minutes: duration });
          const interval = Interval.fromDateTimes(cursor, end);
          if (
            cursor.toUTC() >= min.toUTC() &&
            end.toUTC() <= max.toUTC() &&
            cursor.toUTC() >= now &&
            !occupied.some((x) => x.overlaps(interval))
          )
            slots.push({ start: cursor.toISO()!, end: end.toISO()! });
          cursor = cursor.plus({ minutes: 15 });
        }
      }
      day = day.plus({ days: 1 });
    }
    return slots;
  }
  private assertEventInput(input: Partial<EventInput>) {
    if (!input.start || !input.end || !input.timezone)
      throw new BadRequestException('Inicio, fin y timezone son obligatorios');
    this.assertTimezone(input.timezone);
    if (new Date(input.end) <= new Date(input.start))
      throw new BadRequestException('Rango horario inválido');
  }
  private assertTimezone(zone: string) {
    if (!IANAZone.isValidZone(zone))
      throw new CalendarError('CALENDAR_INVALID_TIMEZONE', 'Zona horaria IANA inválida', 400);
  }
  private clock(value: string) {
    const [h = 0, m = 0] = value.split(':').map(Number);
    return h * 60 + m;
  }
  private async connection(userId: string, active = true) {
    return this.db.calendarConnection.findFirst({
      where: { userId, ...(active ? { status: 'ACTIVE' } : {}) },
      orderBy: { updatedAt: 'desc' },
    });
  }
  private async requireConnection(userId: string) {
    const value = await this.connection(userId);
    if (!value)
      throw new CalendarError(
        'CALENDAR_NOT_CONNECTED',
        'Conecte Google Calendar para continuar',
        409,
      );
    return value;
  }
  private async credentials(connection: any) {
    if (
      connection.accessTokenExpiresAt &&
      connection.accessTokenExpiresAt.getTime() < Date.now() + 60_000
    )
      return this.refresh(connection);
    return { accessToken: this.vault.decrypt(connection.encryptedAccessToken) };
  }
  private async refresh(connection: any) {
    if (!connection.encryptedRefreshToken) {
      await this.db.calendarConnection.update({
        where: { id: connection.id },
        data: { status: 'NEEDS_REAUTHORIZATION', lastErrorCode: 'CALENDAR_AUTH_EXPIRED' },
      });
      throw new CalendarError(
        'CALENDAR_AUTH_EXPIRED',
        'Google Calendar requiere nueva autorización',
        401,
      );
    }
    try {
      const token = await this.tokenRequest({
        refresh_token: this.vault.decrypt(connection.encryptedRefreshToken),
        grant_type: 'refresh_token',
      });
      await this.db.calendarConnection.update({
        where: { id: connection.id },
        data: {
          encryptedAccessToken: this.vault.encrypt(token.access_token),
          accessTokenExpiresAt: new Date(Date.now() + Number(token.expires_in ?? 3600) * 1000),
          status: 'ACTIVE',
          lastErrorCode: null,
        },
      });
      return { accessToken: token.access_token };
    } catch (error) {
      await this.db.calendarConnection.update({
        where: { id: connection.id },
        data: { status: 'NEEDS_REAUTHORIZATION', lastErrorCode: 'CALENDAR_AUTH_EXPIRED' },
      });
      throw error;
    }
  }
  private async tokenRequest(values: Record<string, string>) {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        ...values,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as any;
    if (!response.ok || !data.access_token)
      throw new CalendarError(
        'CALENDAR_AUTH_EXPIRED',
        data.error === 'invalid_grant'
          ? 'La autorización de Google expiró o fue revocada'
          : 'No fue posible completar la autorización de Google',
        401,
      );
    return data;
  }
  private async mutate(
    connectionId: string,
    key: string,
    operation: string,
    callback: () => Promise<any>,
  ) {
    if (!key) throw new BadRequestException('Idempotency-Key es obligatorio');
    const old = await this.db.calendarMutation.findUnique({
      where: { connectionId_idempotencyKey: { connectionId, idempotencyKey: key } },
    });
    if (old?.status === 'SUCCEEDED') return old.result;
    if (old?.status === 'PROCESSING')
      throw new ConflictException('La operación ya está en proceso');
    const row = old
      ? await this.db.calendarMutation.update({
          where: { id: old.id },
          data: { status: 'PROCESSING' },
        })
      : await this.db.calendarMutation.create({
          data: { connectionId, idempotencyKey: key, operation },
        });
    try {
      const result = await callback();
      await this.db.calendarMutation.update({
        where: { id: row.id },
        data: { status: 'SUCCEEDED', result: result as Prisma.InputJsonValue },
      });
      return result;
    } catch (error) {
      await this.db.calendarMutation.update({
        where: { id: row.id },
        data: { status: 'FAILED', errorCode: this.errorCode(error) },
      });
      throw error;
    }
  }
  private async crmEvent(
    action: string,
    actor: Actor,
    input: Partial<EventInput>,
    linkId: string,
    ctx: AuditContext,
    extra: Record<string, unknown> = {},
  ) {
    await this.db.$transaction(async (tx) => {
      if (input.prospectId) {
        await tx.activity.create({
          data: {
            prospectId: input.prospectId,
            opportunityId: input.opportunityId,
            actorId: actor.id,
            type:
              action === 'CALENDAR_EVENT_CREATED'
                ? ActivityType.INTERACTION_RECORDED
                : ActivityType.PROSPECT_UPDATED,
            summary:
              action === 'CALENDAR_EVENT_CANCELLED'
                ? 'Cita cancelada'
                : action === 'CALENDAR_EVENT_UPDATED'
                  ? 'Cita reprogramada o actualizada'
                  : 'Cita agendada',
            metadata: { calendarEventLinkId: linkId },
          },
        });
        await tx.interaction.create({
          data: {
            prospectId: input.prospectId,
            opportunityId: input.opportunityId,
            actorId: actor.id,
            method: 'MEETING',
            summary: action,
            occurredAt: new Date(),
          },
        });
      }
      await this.audit.record(
        action,
        'CalendarEventLink',
        linkId,
        ctx,
        extra as Prisma.InputJsonValue,
        tx,
      );
    });
  }
  private errorCode(error: unknown) {
    return error instanceof CalendarError ? error.code : 'CALENDAR_PROVIDER_UNAVAILABLE';
  }
  private async defaultRules() {
    const setting = await this.db.systemSetting.findUnique({
      where: { key: 'calendar.availability_defaults' },
    });
    const value = setting?.value as Record<string, unknown> | undefined;
    return {
      timezone: String(value?.timezone ?? this.config.timezone),
      workingDays: Array.isArray(value?.workingDays)
        ? (value.workingDays as number[])
        : [1, 2, 3, 4, 5],
      workStart: String(value?.workStart ?? '08:00'),
      workEnd: String(value?.workEnd ?? '18:00'),
      minimumNoticeMinutes: Number(value?.minimumNoticeMinutes ?? 120),
      defaultMeetingDuration: Number(value?.defaultMeetingDuration ?? 45),
      bufferBeforeMinutes: Number(value?.bufferBeforeMinutes ?? 15),
      bufferAfterMinutes: Number(value?.bufferAfterMinutes ?? 15),
      maximumFutureBookingDays: Number(value?.maximumFutureBookingDays ?? 90),
    };
  }
  private async getRulesForUser(userId: string) {
    return this.db.calendarAvailabilityRule.upsert({
      where: { userId },
      update: {},
      create: { userId, ...(await this.defaultRules()) },
    });
  }
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const safeEqual = (left: string, right: string) => {
  const a = Buffer.from(left),
    b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
