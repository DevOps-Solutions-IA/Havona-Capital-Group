import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { CommunicationsConfig } from './communications-config';
@Injectable()
export class CommunicationsQueueService implements OnApplicationShutdown {
  private readonly connection: Redis;
  private readonly queue: Queue;
  constructor(config: CommunicationsConfig) {
    this.connection = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    this.queue = new Queue(config.queueName, { connection: this.connection });
  }
  enqueueSend(messageId: string, idempotencyKey: string) {
    return this.queue.add(
      'communication.send',
      { messageId },
      {
        jobId: `send-${idempotencyKey}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1500 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );
  }
  enqueueInbound(messageId: string) {
    return this.queue.add(
      'communication.inbound',
      { messageId },
      {
        jobId: `inbound-${messageId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );
  }
  async onApplicationShutdown() {
    await this.queue.close();
    await this.connection.quit();
  }
}
