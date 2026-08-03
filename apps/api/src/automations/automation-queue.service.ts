import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

@Injectable()
export class AutomationQueueService implements OnModuleInit, OnApplicationShutdown {
  private connection?: Redis;
  private queue?: Queue;

  async onModuleInit() {
    this.connection = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    this.queue = new Queue(process.env.AUTOMATIONS_QUEUE_NAME ?? 'havona-automations', {
      connection: this.connection,
    });
    await this.queue.waitUntilReady();
  }

  private get activeQueue() {
    if (!this.queue) throw new Error('AUTOMATIONS_QUEUE_NOT_INITIALIZED');
    return this.queue;
  }

  enqueueExecution(executionId: string, delayMs = 0, step = 0) {
    return this.activeQueue.add(
      'automation.execute',
      { executionId },
      {
        jobId: `execution-${executionId}-${step}`,
        delay: Math.max(0, delayMs),
        attempts: 3,
        backoff: { type: 'exponential', delay: 1500 },
        removeOnComplete: 2000,
        removeOnFail: 5000,
      },
    );
  }
  enqueueOutbox(eventId: string) {
    return this.activeQueue.add(
      'automation.outbox',
      { eventId },
      {
        jobId: `outbox-${eventId}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 2000,
        removeOnFail: 5000,
      },
    );
  }
  scheduleWorkflow(
    scheduleId: string,
    workflowId: string,
    runAt?: Date,
    cron?: string,
    timezone = 'America/Bogota',
  ) {
    const jobId = `schedule-${scheduleId}`;
    return this.activeQueue.add(
      'automation.schedule',
      { scheduleId, workflowId },
      {
        jobId,
        ...(cron
          ? { repeat: { pattern: cron, tz: timezone } }
          : { delay: Math.max(0, (runAt?.getTime() ?? Date.now()) - Date.now()) }),
        attempts: 3,
        backoff: { type: 'exponential', delay: 1500 },
        removeOnComplete: 2000,
        removeOnFail: 5000,
      },
    );
  }
  async cancelSchedule(scheduleId: string) {
    const queue = this.activeQueue;
    const job = await queue.getJob(`schedule-${scheduleId}`);
    if (job) await job.remove();
    const repeatables = await queue.getRepeatableJobs();
    for (const repeatable of repeatables.filter((item) => item.id === `schedule-${scheduleId}`))
      await queue.removeRepeatableByKey(repeatable.key);
  }
  async cancelExecution(executionId: string, maxSteps = 50) {
    for (let step = 0; step <= maxSteps; step++) {
      const job = await this.activeQueue.getJob(`execution-${executionId}-${step}`);
      if (job && ['delayed', 'waiting', 'paused'].includes(await job.getState()))
        await job.remove();
    }
  }
  async onApplicationShutdown() {
    await this.queue?.close();
    if (this.connection?.status !== 'end') await this.connection?.quit();
    this.queue = undefined;
    this.connection = undefined;
  }
}
