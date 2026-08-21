import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@havona/database';
import { PrismaService } from '../common/prisma.service';
import { AutomationQueueService } from './automation-queue.service';
import { DomainEventInput } from './automation.types';

@Injectable()
export class AutomationEventBus {
  private readonly logger = new Logger(AutomationEventBus.name);
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
    if (existing) {
      await this.enqueueSafely(input.eventId);
      return { duplicate: true, event: existing };
    }
    const payload = input.payload as Prisma.InputJsonValue;
    let event: any;
    try {
      event = await this.dbx.$transaction(async (tx: any) => {
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
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const concurrent = await this.dbx.automationEvent.findUnique({
        where: { eventId: input.eventId },
      });
      if (!concurrent) throw error;
      await this.enqueueSafely(input.eventId);
      return { duplicate: true, event: concurrent };
    }
    await this.enqueueSafely(input.eventId);
    return { duplicate: false, event };
  }

  private async enqueueSafely(eventId: string) {
    try {
      await this.queue.enqueueOutbox(eventId);
    } catch (error) {
      this.logger.warn({
        event: 'automation.outbox.enqueue_deferred',
        eventId,
        errorCode: error instanceof Error ? error.name : 'QUEUE_UNAVAILABLE',
      });
    }
  }
}
