import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import { z } from 'zod';
import { AutomationService } from './automation.service';

@Injectable()
export class AutomationProcessorService implements OnModuleInit, OnApplicationShutdown {
  private logger = new Logger(AutomationProcessorService.name);
  private connection = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  private worker?: Worker;
  constructor(private automations: AutomationService) {}
  async onModuleInit() {
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
    throw new Error('AUTOMATION_INVALID_TRIGGER');
  }
  async onApplicationShutdown() {
    await this.worker?.close();
    await this.connection.quit();
  }
}
