import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { createRedisClient } from '../common/redis-client';
import { toBullMqJobId } from './automation-job-id';

@Injectable()
export class AutomationQueueService implements OnModuleInit, OnApplicationShutdown {
  private connection?: Redis;
  private queue?: Queue;

  async onModuleInit() {
    this.connection = createRedisClient({
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
        jobId: toBullMqJobId(`execution-${executionId}-${step}`),
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
        jobId: toBullMqJobId(`outbox-${eventId}`),
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
    const jobId = toBullMqJobId(`schedule-${scheduleId}`);
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
    const jobId = toBullMqJobId(`schedule-${scheduleId}`);
    const job = await queue.getJob(jobId);
    if (job) await job.remove();
    const repeatables = await queue.getRepeatableJobs();
    for (const repeatable of repeatables.filter((item) => item.id === jobId))
      await queue.removeRepeatableByKey(repeatable.key);
  }
  async cancelExecution(executionId: string, maxSteps = 50) {
    for (let step = 0; step <= maxSteps; step++) {
      const job = await this.activeQueue.getJob(toBullMqJobId(`execution-${executionId}-${step}`));
      if (job && ['delayed', 'waiting', 'paused'].includes(await job.getState()))
        await job.remove();
    }
  }
  async scheduleMessagingOperation(operationId: string, runAt: Date) {
    const jobId = toBullMqJobId(`henry-email-${operationId}`);
    await this.activeQueue.add(
      'automation.messaging-send',
      { operationId },
      {
        jobId,
        delay: Math.max(0, runAt.getTime() - Date.now()),
        attempts: 3,
        backoff: { type: 'exponential', delay: 1500 },
        removeOnComplete: 2000,
        removeOnFail: 5000,
      },
    );
    return jobId;
  }
  async cancelMessagingOperation(operationId: string) {
    const jobId = toBullMqJobId(`henry-email-${operationId}`);
    const job = await this.activeQueue.getJob(jobId);
    if (!job) return false;
    const state = await job.getState();
    if (!['delayed', 'waiting', 'paused'].includes(state)) return false;
    await job.remove();
    return true;
  }
  async scheduleCadenceStep(enrollmentId: string, stepExecutionId: string, runAt: Date) {
    const jobId = toBullMqJobId(`cadence-${enrollmentId}-${stepExecutionId}`);
    await this.activeQueue.add(
      'automation.cadence-step',
      { enrollmentId, stepExecutionId },
      {
        jobId,
        delay: Math.max(0, runAt.getTime() - Date.now()),
        attempts: 3,
        backoff: { type: 'exponential', delay: 1500 },
        removeOnComplete: 2000,
        removeOnFail: 5000,
      },
    );
    return jobId;
  }
  async cancelCadenceEnrollment(enrollmentId: string) {
    const jobs = await this.activeQueue.getJobs(['delayed', 'waiting', 'paused']);
    for (const job of jobs)
      if (job.name === 'automation.cadence-step' && job.data?.enrollmentId === enrollmentId)
        await job.remove();
  }
  async onApplicationShutdown() {
    await this.queue?.close();
    if (this.connection?.status !== 'end') await this.connection?.quit();
    this.queue = undefined;
    this.connection = undefined;
  }
}
