import { Injectable } from '@nestjs/common';
import { Prisma } from '@havona/database';
import { PrismaService } from '../common/prisma.service';
import { AutomationQueueService } from './automation-queue.service';
import { DomainEventInput } from './automation.types';

@Injectable()
export class AutomationEventBus {
  private dbx: any;
  constructor(
    db: PrismaService,
    private queue: AutomationQueueService,
  ) {
    this.dbx = db as any;
  }
  async publish(input: DomainEventInput) {
    const existing = await this.dbx.automationEvent.findUnique({
      where: { eventId: input.eventId },
    });
    if (existing) return { duplicate: true, event: existing };
    const payload = input.payload as Prisma.InputJsonValue;
    const event = await this.dbx.$transaction(async (tx: any) => {
      const created = await tx.automationEvent.create({
        data: { ...input, payload, occurredAt: input.occurredAt ?? new Date() },
      });
      await tx.domainOutboxEvent.create({
        data: {
          eventId: input.eventId,
          aggregateType: input.entityType,
          aggregateId: input.entityId,
          eventType: input.type,
          payload,
        },
      });
      return created;
    });
    await this.queue.enqueueOutbox(input.eventId);
    return { duplicate: false, event };
  }
}
