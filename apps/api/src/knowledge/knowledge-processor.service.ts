import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { z } from 'zod';
import { createRedisClient } from '../common/redis-client';
import { KnowledgeService } from './knowledge.service';

@Injectable()
export class KnowledgeProcessorService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(KnowledgeProcessorService.name);
  private connection?: Redis;
  private worker?: Worker;
  constructor(private readonly knowledge: KnowledgeService) {}
  async onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.KNOWLEDGE_WORKER_ENABLED === 'false') return;
    this.connection = createRedisClient({
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    this.worker = new Worker(
      process.env.KNOWLEDGE_QUEUE_NAME ?? 'havona-knowledge',
      async (job) => {
        if (job.name !== 'knowledge.ingest') throw new Error('KNOWLEDGE_JOB_INVALID');
        return this.knowledge.processVersion(z.string().uuid().parse(job.data?.versionId));
      },
      {
        connection: this.connection,
        concurrency: Number(process.env.KNOWLEDGE_WORKER_CONCURRENCY ?? 2),
        lockDuration: 180_000,
      },
    );
    this.worker.on('failed', (job, error) =>
      this.logger.error({
        event: 'knowledge.ingestion.failed',
        jobId: job?.id,
        errorCode: error.message.slice(0, 100),
      }),
    );
    await this.worker.waitUntilReady();
  }
  async onApplicationShutdown() {
    await this.worker?.close(true);
    if (this.connection?.status !== 'end') await this.connection?.quit();
    this.worker = undefined;
    this.connection = undefined;
  }
}
