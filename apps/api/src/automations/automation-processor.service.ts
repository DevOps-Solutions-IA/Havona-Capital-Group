import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import { z } from 'zod';
import { AutomationService } from './automation.service';
import { HenryMessagingOperatorService } from '../henry/henry-messaging-operator.service';
import { CadenceService } from '../cadences/cadence.service';

@Injectable()
export class AutomationProcessorService implements OnModuleInit, OnApplicationShutdown {
  private logger = new Logger(AutomationProcessorService.name);
  private connection?: Redis;
  private worker?: Worker;
  constructor(
    private automations: AutomationService,
    private moduleRef: ModuleRef,
  ) {}
  async onModuleInit() {
    // Integration tests drive outbox dispatch and execution deterministically.
    // Starting a competing background worker in the same Jest process introduces
    // nondeterministic races and leaves an unnecessary Redis blocking connection.
    if (process.env.NODE_ENV === 'test') return;
    this.connection = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    this.worker = new Worker(
      process.env.AUTOMATIONS_QUEUE_NAME ?? 'havona-automations',
      (job) => this.process(job),
      {
        connection: this.connection,
        concurrency: Number(process.env.AUTOMATIONS_WORKER_CONCURRENCY ?? 5),
        lockDuration: 120_000,
      },
    );
    this.worker.on('failed', (job, error) =>
      this.logger.error({
        event: 'automation.job.failed',
        jobId: job?.id,
        errorCode: error.message.slice(0, 100),
      }),
    );
    await this.worker.waitUntilReady();
    await this.automations.recoverPending();
  }
  private process(job: Job) {
    if (job.name === 'automation.outbox')
      return this.automations.dispatchOutbox(z.string().min(8).parse(job.data?.eventId));
    if (job.name === 'automation.execute')
      return this.automations.execute(z.string().uuid().parse(job.data?.executionId));
    if (job.name === 'automation.schedule')
      return this.automations.fireSchedule(z.string().uuid().parse(job.data?.scheduleId));
    if (job.name === 'automation.messaging-send')
      return this.moduleRef
        .get(HenryMessagingOperatorService, { strict: false })
        .executeScheduled(z.string().uuid().parse(job.data?.operationId));
    if (job.name === 'automation.cadence-step')
      return this.moduleRef
        .get(CadenceService, { strict: false })
        .executeStep(z.string().uuid().parse(job.data?.stepExecutionId));
    throw new Error('AUTOMATION_INVALID_TRIGGER');
  }
  async onApplicationShutdown() {
    // A shutdown must not hang behind an active provider action. BullMQ releases the
    // lock and the persisted execution is recovered safely by recoverPending().
    await this.worker?.close(true);
    if (this.connection?.status !== 'end') await this.connection?.quit();
    this.worker = undefined;
    this.connection = undefined;
  }
}
