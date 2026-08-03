import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

@Injectable()
export class AutomationQueueService implements OnApplicationShutdown {
  private connection = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  private queue = new Queue(process.env.AUTOMATIONS_QUEUE_NAME ?? 'havona-automations', {
    connection: this.connection,
  });

  enqueueExecution(executionId: string, delayMs = 0, step = 0) {
    return this.queue.add(
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
    return this.queue.add(
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
    return this.queue.add(
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
    const job = await this.queue.getJob(`schedule-${scheduleId}`);
    if (job) await job.remove();
    const repeatables = await this.queue.getRepeatableJobs();
    for (const repeatable of repeatables.filter((item) => item.id === `schedule-${scheduleId}`))
      await this.queue.removeRepeatableByKey(repeatable.key);
  }
  async cancelExecution(executionId: string, maxSteps = 50) {
    for (let step = 0; step <= maxSteps; step++) {
      const job = await this.queue.getJob(`execution-${executionId}-${step}`);
      if (job && ['delayed', 'waiting', 'paused'].includes(await job.getState()))
        await job.remove();
    }
  }
  async onApplicationShutdown() {
    await this.queue.close();
    await this.connection.quit();
  }
}
