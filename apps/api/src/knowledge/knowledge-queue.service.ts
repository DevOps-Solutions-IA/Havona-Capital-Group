import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { createRedisClient } from '../common/redis-client';

@Injectable()
export class KnowledgeQueueService implements OnModuleInit, OnApplicationShutdown {
  private connection?: Redis;
  private queue?: Queue;
  async onModuleInit() {
    this.connection = createRedisClient({
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    this.queue = new Queue(process.env.KNOWLEDGE_QUEUE_NAME ?? 'havona-knowledge', {
      connection: this.connection,
    });
    await this.queue.waitUntilReady();
  }
  enqueue(versionId: string) {
    if (!this.queue) throw new Error('KNOWLEDGE_QUEUE_NOT_INITIALIZED');
    return this.queue.add(
      'knowledge.ingest',
      { versionId },
      {
        jobId: `knowledge-${versionId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: 1000,
        removeOnFail: 3000,
      },
    );
  }
  async onApplicationShutdown() {
    await this.queue?.close();
    if (this.connection?.status !== 'end') await this.connection?.quit();
    this.queue = undefined;
    this.connection = undefined;
  }
}
