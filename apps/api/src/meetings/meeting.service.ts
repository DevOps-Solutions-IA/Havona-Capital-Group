import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@havona/database';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { IANAZone } from 'luxon';
import { AuditContext, AuditService } from '../audit/audit.service';
import {
  CalendarAccessService,
  CalendarActor,
  CalendarRelations,
} from '../calendar/calendar-access.service';
import { PrismaService } from '../common/prisma.service';
import { MeetingConfig } from './meeting-config';
import {
  MEETING_PROVIDER,
  MeetingDescriptor,
  MeetingError,
  MeetingProvider,
  MeetingRole,
} from './meeting.types';

type Actor = CalendarActor & { name?: string; email?: string };
type Input = CalendarRelations & {
  title: string;
  description?: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  timezone: string;
  ownerUserId?: string;
  assignedConsultantId?: string;
  calendarEventLinkId?: string;
  joinPolicy?: 'AUTHENTICATED' | 'INVITED';
  guestAccessPolicy?: 'DISABLED' | 'SIGNED_INVITATION';
  allowGuestBeforeHost?: boolean;
  joinEarlyMinutes?: number;
  joinLateMinutes?: number;
  lobbyRequired?: boolean;
};
@Injectable()
export class MeetingService {
  constructor(
    private db: PrismaService,
    private access: CalendarAccessService,
    private audit: AuditService,
    private config: MeetingConfig,
    @Inject(MEETING_PROVIDER) private provider: MeetingProvider,
  ) {}
  async list(actor: Actor, q: any = {}) {
    const owner = q.ownerUserId ?? actor.id;
    await this.access.assertUserScope(actor, owner);
    return this.db.meeting.findMany({
      where: {
        ownerUserId: owner,
        ...(q.status ? { status: q.status } : {}),
        scheduledStartAt: {
          ...(q.from ? { gte: new Date(q.from) } : {}),
          ...(q.to ? { lte: new Date(q.to) } : {}),
        },
      },
      orderBy: { scheduledStartAt: 'asc' },
      select: this.view,
    });
  }
  async team(actor: Actor, q: any = {}) {
    if (!actor.permissions.includes('meeting.manage_team'))
      throw new ForbiddenException('Permiso de reuniones de equipo requerido');
    return this.list(actor, q);
  }
  async get(actor: Actor, id: string) {
    const m = await this.authorized(actor, id);
    return this.present(m);
  }
  async create(actor: Actor, input: Input, key: string, ctx: AuditContext) {
    if (!actor.permissions.includes('meeting.create'))
      throw new ForbiddenException('Permiso para crear reuniones requerido');
    if (!key || key.length > 120) throw new BadRequestException('Idempotency-Key es obligatorio');
    const prior = await this.db.meeting.findUnique({
      where: { idempotencyKey: key },
      select: this.view,
    });
    if (prior) {
      if (prior.createdById !== actor.id) throw new ForbiddenException('Operación fuera de ámbito');
      return prior;
    }
    this.assertTime(input);
    const owner = input.ownerUserId ?? actor.id;
    await this.access.assertUserScope(actor, owner);
    await this.access.authorizeRelations(actor, input);
    const assignee = await this.access.resolveAssignedConsultant(
      actor,
      input.assignedConsultantId,
      owner,
    );
    let calendarLink: any = null;
    if (input.calendarEventLinkId) {
      calendarLink = await this.db.calendarEventLink.findUnique({
        where: { id: input.calendarEventLinkId },
        include: { connection: true },
      });
      if (!calendarLink) throw new NotFoundException('Cita no encontrada');
      await this.access.assertUserScope(actor, calendarLink.connection.userId);
      await this.access.authorizeRelations(actor, {
        prospectId: calendarLink.prospectId ?? undefined,
        companyId: calendarLink.companyId ?? undefined,
        opportunityId: calendarLink.opportunityId ?? undefined,
        conversationId: calendarLink.conversationId ?? undefined,
      });
      if (calendarLink.connection.userId !== owner)
        throw new BadRequestException('La cita no pertenece al propietario indicado');
      this.assertCalendarConsistency(input, calendarLink);
    }
    const conflict = await this.db.meeting.findFirst({
      where: {
        ownerUserId: owner,
        status: { in: ['SCHEDULED', 'ACTIVE'] },
        scheduledStartAt: { lt: new Date(input.scheduledEndAt) },
        scheduledEndAt: { gt: new Date(input.scheduledStartAt) },
      },
      select: { id: true },
    });
    if (conflict)
      throw new MeetingError(
        'MEETING_CONFLICT',
        'El propietario ya tiene una reunión en ese horario',
        409,
      );
    const room = `${this.config.prefix}-${randomBytes(18).toString('base64url').toLowerCase()}`;
    const remote = await this.provider.createMeeting({ roomName: room, title: input.title });
    const meeting = await this.db.meeting.create({
      data: {
        providerMeetingId: remote.providerMeetingId,
        idempotencyKey: key,
        title: input.title,
        description: input.description,
        scheduledStartAt: new Date(input.scheduledStartAt),
        scheduledEndAt: new Date(input.scheduledEndAt),
        timezone: input.timezone,
        createdById: actor.id,
        ownerUserId: owner,
        assignedConsultantId: assignee,
        calendarEventLinkId: input.calendarEventLinkId,
        prospectId: input.prospectId ?? calendarLink?.prospectId,
        companyId: input.companyId ?? calendarLink?.companyId,
        opportunityId: input.opportunityId ?? calendarLink?.opportunityId,
        conversationId: input.conversationId ?? calendarLink?.conversationId,
        joinPolicy: input.joinPolicy,
        guestAccessPolicy: input.guestAccessPolicy,
        allowGuestBeforeHost: input.allowGuestBeforeHost,
        joinEarlyMinutes: input.joinEarlyMinutes,
        joinLateMinutes: input.joinLateMinutes,
        lobbyRequired: input.lobbyRequired,
        participants: { create: { userId: owner, role: 'HOST' } },
      },
      select: this.view,
    });
    await this.audit.record('MEETING_CREATED', 'Meeting', meeting.id, ctx, {
      provider: 'JITSI',
      ownerUserId: owner,
      assignedConsultantId: assignee,
      calendarEventLinkId: input.calendarEventLinkId,
    });
    await this.recordCrm('MEETING_CREATED', actor.id, meeting);
    return meeting;
  }
  async update(actor: Actor, id: string, input: any, ctx: AuditContext) {
    const m = await this.authorized(actor, id, true);
    const start = input.scheduledStartAt ?? m.scheduledStartAt.toISOString(),
      end = input.scheduledEndAt ?? m.scheduledEndAt.toISOString();
    this.assertTime({
      scheduledStartAt: start,
      scheduledEndAt: end,
      timezone: input.timezone ?? m.timezone,
    } as Input);
    const assignee =
      input.assignedConsultantId === undefined
        ? m.assignedConsultantId
        : await this.access.resolveAssignedConsultant(
            actor,
            input.assignedConsultantId,
            m.ownerUserId,
          );
    const updated = await this.db.meeting.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        scheduledStartAt: input.scheduledStartAt ? new Date(input.scheduledStartAt) : undefined,
        scheduledEndAt: input.scheduledEndAt ? new Date(input.scheduledEndAt) : undefined,
        timezone: input.timezone,
        assignedConsultantId: assignee,
      },
      select: this.view,
    });
    await this.provider.updateMeetingMetadata(this.descriptor(updated));
    await this.audit.record('MEETING_UPDATED', 'Meeting', id, ctx, {
      assignedConsultantId: assignee,
    });
    await this.recordCrm('MEETING_UPDATED', actor.id, updated);
    return updated;
  }
  async cancel(actor: Actor, id: string, reason: string, ctx: AuditContext) {
    const m = await this.authorized(actor, id, true);
    if (m.status === 'CANCELLED') return this.present(m);
    await this.provider.cancelMeeting(this.descriptor(m));
    const updated = await this.db.$transaction(async (tx) => {
      const row = await tx.meeting.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason },
        select: this.view,
      });
      await tx.meetingInvitation.updateMany({
        where: { meetingId: id, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      return row;
    });
    await this.audit.record('MEETING_CANCELLED', 'Meeting', id, ctx, { reason });
    await this.recordCrm('MEETING_CANCELLED', actor.id, updated);
    return updated;
  }
  async join(actor: Actor, id: string, ctx: AuditContext) {
    const m = await this.authorized(actor, id);
    const participant = await this.db.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId: id, userId: actor.id } },
    });
    const role: MeetingRole =
      participant?.role ?? (m.ownerUserId === actor.id ? 'HOST' : 'PARTICIPANT');
    const identity =
      actor.name && actor.email
        ? actor
        : await this.db.user.findUniqueOrThrow({
            where: { id: actor.id },
            select: { id: true, name: true, email: true },
          });
    this.provider.validateMeetingAccess(this.descriptor(m));
    const join = await this.provider.getJoinConfiguration(this.descriptor(m), {
      id: actor.id,
      name: identity.name!,
      email: identity.email,
      role,
    });
    await this.audit.record('MEETING_JOIN_GRANTED', 'Meeting', id, ctx, { role });
    return join;
  }
  async invite(actor: Actor, id: string, input: any, ctx: AuditContext) {
    const m = await this.authorized(actor, id, true);
    if (m.guestAccessPolicy === 'DISABLED')
      throw new ForbiddenException('Invitados deshabilitados');
    const expiry = new Date(input.expiresAt);
    if (
      expiry <= new Date() ||
      expiry > new Date(m.scheduledEndAt.getTime() + m.joinLateMinutes * 60000)
    )
      throw new BadRequestException('Expiración de invitación inválida');
    const token = randomBytes(32).toString('base64url');
    const invitation = await this.db.meetingInvitation.create({
      data: {
        meetingId: id,
        tokenHash: hash(token),
        expectedEmail: input.expectedEmail?.toLowerCase(),
        displayName: input.displayName,
        expiresAt: expiry,
        createdById: actor.id,
      },
    });
    await this.audit.record('MEETING_INVITATION_CREATED', 'MeetingInvitation', invitation.id, ctx, {
      meetingId: id,
      expiresAt: expiry,
    });
    return {
      id: invitation.id,
      token,
      joinUrl: `${process.env.APP_ORIGIN ?? 'http://localhost:3000'}/meet/invitado?token=${encodeURIComponent(token)}`,
      expiresAt: expiry,
    };
  }
  async revokeInvite(actor: Actor, id: string, invitationId: string, ctx: AuditContext) {
    await this.authorized(actor, id, true);
    const result = await this.db.meetingInvitation.updateMany({
      where: { id: invitationId, meetingId: id, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    if (!result.count) throw new NotFoundException('Invitación no encontrada');
    await this.audit.record('MEETING_INVITATION_REVOKED', 'MeetingInvitation', invitationId, ctx, {
      meetingId: id,
    });
    return { revoked: true };
  }
  async guestJoin(token: string, name: string | undefined, ctx: AuditContext) {
    const invitation = await this.db.meetingInvitation.findUnique({
      where: { tokenHash: hash(token) },
      include: { meeting: true },
    });
    if (!invitation || !safeHash(token, invitation.tokenHash))
      throw new MeetingError('MEETING_TOKEN_INVALID', 'Invitación inválida', 401);
    if (invitation.status !== 'ACTIVE')
      throw new MeetingError('MEETING_TOKEN_INVALID', 'Invitación revocada o utilizada', 401);
    if (invitation.expiresAt < new Date())
      throw new MeetingError('MEETING_TOKEN_EXPIRED', 'La invitación expiró', 401);
    this.provider.validateMeetingAccess(this.descriptor(invitation.meeting));
    const join = await this.provider.getJoinConfiguration(this.descriptor(invitation.meeting), {
      id: `guest-${invitation.id}`,
      name: name ?? invitation.displayName ?? 'Invitado',
      email: invitation.expectedEmail ?? undefined,
      role: 'GUEST',
    });
    await this.db.meetingInvitation.update({
      where: { id: invitation.id },
      data: { usedAt: new Date() },
    });
    await this.audit.record('MEETING_GUEST_JOIN_GRANTED', 'Meeting', invitation.meetingId, ctx, {
      invitationId: invitation.id,
    });
    return join;
  }
  async providerEvent(secret: string, input: any) {
    if (!this.config.webhookSecret || !constant(secret, this.config.webhookSecret))
      throw new MeetingError('MEETING_TOKEN_INVALID', 'Webhook inválido', 401);
    const meeting = await this.db.meeting.findUnique({ where: { id: input.meetingId } });
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    await this.db.meetingAttendanceEvent.upsert({
      where: { providerEventId: input.providerEventId },
      update: {},
      create: {
        meetingId: meeting.id,
        providerEventId: input.providerEventId,
        participantExternalId: input.participantExternalId,
        type: input.type,
        occurredAt: new Date(input.occurredAt),
      },
    });
    if (input.type === 'STARTED')
      await this.db.meeting.update({ where: { id: meeting.id }, data: { status: 'ACTIVE' } });
    if (input.type === 'ENDED')
      await this.db.meeting.update({ where: { id: meeting.id }, data: { status: 'COMPLETED' } });
    return { accepted: true };
  }
  private async authorized(actor: Actor, id: string, manage = false) {
    const m = await this.db.meeting.findUnique({ where: { id }, include: { participants: true } });
    if (!m) throw new NotFoundException('Reunión no encontrada');
    if (
      manage &&
      !actor.permissions.includes(
        m.ownerUserId === actor.id ? 'meeting.manage_own' : 'meeting.manage_team',
      )
    )
      throw new ForbiddenException('No puede gestionar esta reunión');
    if (
      !manage &&
      !actor.permissions.includes('meeting.read') &&
      !actor.permissions.includes('meeting.join')
    )
      throw new ForbiddenException('No puede consultar esta reunión');
    if (m.ownerUserId !== actor.id && !m.participants.some((p) => p.userId === actor.id))
      await this.access.assertUserScope(actor, m.ownerUserId);
    return m;
  }
  async rescheduleFromCalendar(
    calendarEventLinkId: string,
    start: Date,
    end: Date,
    timezone: string,
  ) {
    const m = await this.db.meeting.findUnique({ where: { calendarEventLinkId } });
    if (!m) return;
    const updated = await this.db.meeting.update({
      where: { id: m.id },
      data: { scheduledStartAt: start, scheduledEndAt: end, timezone },
    });
    await this.provider.updateMeetingMetadata(this.descriptor(updated));
  }
  async cancelFromCalendar(calendarEventLinkId: string, reason: string) {
    const m = await this.db.meeting.findUnique({ where: { calendarEventLinkId } });
    if (!m || m.status === 'CANCELLED') return;
    await this.provider.cancelMeeting(this.descriptor(m));
    await this.db.$transaction([
      this.db.meeting.update({
        where: { id: m.id },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason },
      }),
      this.db.meetingInvitation.updateMany({
        where: { meetingId: m.id, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date() },
      }),
    ]);
  }
  private assertTime(input: Input) {
    if (!IANAZone.isValidZone(input.timezone))
      throw new MeetingError('MEETING_INVALID_TIMEZONE', 'Zona horaria inválida', 400);
    if (new Date(input.scheduledEndAt) <= new Date(input.scheduledStartAt))
      throw new BadRequestException('Rango de reunión inválido');
  }
  private assertCalendarConsistency(input: Input, link: any) {
    for (const key of ['prospectId', 'companyId', 'opportunityId', 'conversationId'] as const) {
      if (input[key] && link[key] && input[key] !== link[key])
        throw new BadRequestException('Las relaciones CRM no coinciden con la cita vinculada');
    }
    if (
      new Date(input.scheduledStartAt).getTime() !== new Date(link.startAt).getTime() ||
      new Date(input.scheduledEndAt).getTime() !== new Date(link.endAt).getTime()
    )
      throw new BadRequestException('La ventana de reunión debe coincidir con la cita vinculada');
  }
  private async recordCrm(action: string, actorId: string, meeting: any) {
    if (!meeting.prospectId) return;
    await this.db.$transaction([
      this.db.activity.create({
        data: {
          prospectId: meeting.prospectId,
          opportunityId: meeting.opportunityId,
          actorId,
          type: 'INTERACTION_RECORDED',
          summary:
            action === 'MEETING_CANCELLED'
              ? 'HAVONA Meet cancelado'
              : action === 'MEETING_UPDATED'
                ? 'HAVONA Meet actualizado'
                : 'HAVONA Meet programado',
          metadata: { meetingId: meeting.id },
        },
      }),
      this.db.interaction.create({
        data: {
          prospectId: meeting.prospectId,
          opportunityId: meeting.opportunityId,
          actorId,
          method: 'VIDEO',
          summary: action,
          occurredAt: new Date(),
        },
      }),
    ]);
  }
  private descriptor(m: any): MeetingDescriptor {
    return {
      roomName: m.providerMeetingId,
      title: m.title,
      scheduledStartAt: new Date(m.scheduledStartAt),
      scheduledEndAt: new Date(m.scheduledEndAt),
      status: m.status,
      lobbyRequired: m.lobbyRequired,
      allowGuestBeforeHost: m.allowGuestBeforeHost,
      joinEarlyMinutes: m.joinEarlyMinutes,
      joinLateMinutes: m.joinLateMinutes,
    };
  }
  private present(m: any) {
    return m;
  }
  private readonly view = {
    id: true,
    provider: true,
    providerMeetingId: true,
    title: true,
    description: true,
    status: true,
    scheduledStartAt: true,
    scheduledEndAt: true,
    timezone: true,
    createdById: true,
    ownerUserId: true,
    assignedConsultantId: true,
    calendarEventLinkId: true,
    prospectId: true,
    companyId: true,
    opportunityId: true,
    conversationId: true,
    joinPolicy: true,
    guestAccessPolicy: true,
    allowGuestBeforeHost: true,
    joinEarlyMinutes: true,
    joinLateMinutes: true,
    lobbyRequired: true,
    cancelledAt: true,
    cancellationReason: true,
    createdAt: true,
    updatedAt: true,
  } as const;
}
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const constant = (a: string, b: string) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const safeHash = (token: string, expected: string) => constant(hash(token), expected);
