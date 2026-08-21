import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@havona/database';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma.service';
import { MemoryPolicy } from './memory-policy.service';

@Injectable()
export class HenryMemoryService {
  constructor(
    private readonly db: PrismaService,
    private readonly policy: MemoryPolicy,
    private readonly audit: AuditService,
  ) {}
  list(userId: string) {
    return this.db.henryMemory.findMany({
      where: { userId, OR: [{ retentionUntil: null }, { retentionUntil: { gt: new Date() } }] },
      select: {
        id: true,
        key: true,
        value: true,
        category: true,
        source: true,
        explicit: true,
        inferredConfidence: true,
        retentionUntil: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
  async save(
    userId: string,
    input: {
      key: string;
      value: unknown;
      confirmed?: boolean;
      source?: string;
      retentionDays?: number;
    },
    request?: any,
  ) {
    const category = this.policy.assertWrite(input.key, input.value, input.confirmed === true);
    const row = await this.db.henryMemory.upsert({
      where: { userId_key: { userId, key: input.key } },
      create: {
        userId,
        key: input.key,
        value: input.value as Prisma.InputJsonValue,
        category,
        source: input.source ?? 'USER_EXPLICIT',
        explicit: true,
        retentionUntil: new Date(Date.now() + (input.retentionDays ?? 365) * 86_400_000),
      },
      update: {
        value: input.value as Prisma.InputJsonValue,
        category,
        source: input.source ?? 'USER_EXPLICIT',
        explicit: true,
        retentionUntil: new Date(Date.now() + (input.retentionDays ?? 365) * 86_400_000),
      },
    });
    await this.audit.record(
      'HENRY_MEMORY_SAVED',
      'HenryMemory',
      row.id,
      { actorUserId: userId, ipAddress: request?.ip, userAgent: request?.headers?.['user-agent'] },
      { key: row.key, category: row.category },
    );
    return row;
  }
  async forget(userId: string, id: string, request?: any) {
    const row = await this.db.henryMemory.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('MEMORY_NOT_FOUND');
    await this.db.henryMemory.delete({ where: { id } });
    await this.audit.record(
      'HENRY_MEMORY_FORGOTTEN',
      'HenryMemory',
      id,
      { actorUserId: userId, ipAddress: request?.ip, userAgent: request?.headers?.['user-agent'] },
      { key: row.key },
    );
    return { id, forgotten: true };
  }
}
