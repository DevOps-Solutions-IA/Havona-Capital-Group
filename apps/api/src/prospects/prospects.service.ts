import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { CaptureProspectInput, ProspectListQuery } from '@havona/contracts';
import { LeadEventType, Prisma, ProspectStatus } from '@havona/database';
import { AuditContext, AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma.service';
import { AutomationEventBus } from '../automations/automation-event-bus.service';

const normalizePhone = (phone?: string) => phone?.replace(/\D/g, '') || undefined;

@Injectable()
export class ProspectsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly eventBus?: AutomationEventBus,
  ) {}

  async capture(input: CaptureProspectInput, context: AuditContext) {
    const normalizedPhone = normalizePhone(input.phone);
    const normalizedEmail = input.email?.toLowerCase();

    try {
      const result = await this.captureTransaction(
        input,
        normalizedEmail,
        normalizedPhone,
        context,
      );
      await this.eventBus?.publish({
        eventId: `prospect:capture:${input.submissionId}`,
        type: 'PROSPECT_CREATED',
        entityType: 'Prospect',
        entityId: result.id,
        payload: { prospectId: result.id, source: input.source, interest: input.interest },
      });
      return result;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const idempotent = await this.db.leadEvent.findUnique({
        where: { submissionId: input.submissionId },
        select: { prospect: { select: { id: true, status: true } } },
      });
      if (idempotent) return idempotent.prospect;
      const result = await this.captureTransaction(
        input,
        normalizedEmail,
        normalizedPhone,
        context,
      );
      await this.eventBus?.publish({
        eventId: `prospect:capture:${input.submissionId}`,
        type: 'PROSPECT_CREATED',
        entityType: 'Prospect',
        entityId: result.id,
        payload: { prospectId: result.id, source: input.source, interest: input.interest },
      });
      return result;
    }
  }

  private captureTransaction(
    input: CaptureProspectInput,
    normalizedEmail: string | undefined,
    normalizedPhone: string | undefined,
    context: AuditContext,
  ) {
    return this.db.$transaction(async (tx) => {
      const previousEvent = await tx.leadEvent.findUnique({
        where: { submissionId: input.submissionId },
        select: { prospect: { select: { id: true, status: true } } },
      });
      if (previousEvent) return previousEvent.prospect;

      const source = await tx.leadSource.findFirst({
        where: { key: input.source, isActive: true },
      });
      if (!source) throw new BadRequestException('Fuente de captación inválida');

      const matches: Prisma.ProspectWhereInput[] = [];
      if (normalizedEmail) matches.push({ normalizedEmail });
      if (normalizedPhone) matches.push({ normalizedPhone });
      const matched = matches.length
        ? await tx.prospect.findMany({ where: { OR: matches }, take: 2 })
        : [];
      if (matched.length > 1)
        throw new ConflictException(
          'No fue posible consolidar la solicitud. Revise los datos de contacto.',
        );
      const existing = matched[0] ?? null;
      const prospect = existing
        ? await tx.prospect.update({
            where: { id: existing.id },
            data: {
              lastCapturedAt: new Date(),
              email: existing.email ?? input.email,
              normalizedEmail: existing.normalizedEmail ?? normalizedEmail,
              phone: existing.phone ?? input.phone,
              normalizedPhone: existing.normalizedPhone ?? normalizedPhone,
            },
          })
        : await tx.prospect.create({
            data: {
              name: input.name,
              phone: input.phone,
              normalizedPhone,
              email: input.email,
              normalizedEmail,
              city: input.city,
              sourceId: source.id,
              campaign: input.campaign,
              landing: input.landing,
              interest: input.interest,
              message: input.message,
            },
          });

      await tx.consent.create({
        data: {
          prospectId: prospect.id,
          accepted: input.consent.accepted,
          privacyVersion: input.consent.privacyVersion,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
      const eventType = existing ? LeadEventType.RECAPTURED : LeadEventType.CAPTURED;
      await tx.leadEvent.create({
        data: {
          prospectId: prospect.id,
          submissionId: input.submissionId,
          type: eventType,
          sourceId: source.id,
          campaign: input.campaign,
          landing: input.landing,
          interest: input.interest,
        },
      });
      await this.audit.record(
        'PROSPECT_CAPTURED',
        'Prospect',
        prospect.id,
        context,
        {
          source: input.source,
          landing: input.landing,
          eventType,
        },
        tx,
      );
      console.info(
        JSON.stringify({
          level: 'info',
          event: 'prospect_captured',
          prospectId: prospect.id,
          source: input.source,
          landing: input.landing,
          duplicate: Boolean(existing),
        }),
      );
      return { id: prospect.id, status: prospect.status };
    });
  }

  async list(query: ProspectListQuery) {
    const where: Prisma.ProspectWhereInput = {
      status: query.status as ProspectStatus | undefined,
      landing: query.landing,
      interest: query.interest,
      source: query.source ? { key: query.source } : undefined,
      OR: query.search
        ? [
            { name: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
            { phone: { contains: query.search } },
            { city: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const orderBy = { [query.sortBy]: query.sortOrder } as Prisma.ProspectOrderByWithRelationInput;
    const [data, total] = await this.db.$transaction([
      this.db.prospect.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          city: true,
          status: true,
          landing: true,
          interest: true,
          campaign: true,
          firstCapturedAt: true,
          lastCapturedAt: true,
          source: { select: { key: true, name: true } },
          _count: { select: { events: true, consents: true } },
        },
      }),
      this.db.prospect.count({ where }),
    ]);
    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async get(id: string, context: AuditContext) {
    const prospect = await this.db.prospect.findUnique({
      where: { id },
      include: {
        source: { select: { key: true, name: true } },
        consents: { orderBy: { acceptedAt: 'desc' } },
        events: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!prospect) throw new NotFoundException('Prospecto no encontrado');
    await this.audit.record('PROSPECT_VIEWED', 'Prospect', id, context);
    return prospect;
  }
}
