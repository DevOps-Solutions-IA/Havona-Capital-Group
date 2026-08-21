import { Injectable } from '@nestjs/common';
import { Prisma } from '@havona/database';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class VoiceSessionService {
  constructor(private readonly db: PrismaService) {}

  async start(input: { conversationId: string; provider: string; externalConversationId?: string; authenticatedUserId?: string; roleContext: string; metadata?: Prisma.InputJsonValue }) {
    if (input.externalConversationId) {
      const existing = await this.db.voiceSession.findUnique({ where: { provider_externalConversationId: { provider: input.provider, externalConversationId: input.externalConversationId } } });
      if (existing) return this.db.voiceSession.update({ where: { id: existing.id }, data: { status: 'ACTIVE', endedAt: null, metadata: input.metadata } });
    }
    return this.db.voiceSession.create({ data: { ...input, status: 'ACTIVE' } });
  }

  findExternal(provider: string, externalConversationId: string) {
    return this.db.voiceSession.findUnique({ where: { provider_externalConversationId: { provider, externalConversationId } } });
  }

  complete(id: string) { return this.db.voiceSession.update({ where: { id }, data: { status: 'COMPLETED', endedAt: new Date() } }); }
  async resume(id: string, conversationId: string) {
    const session = await this.db.voiceSession.findFirst({ where: { id, conversationId } });
    if (!session) return null;
    return this.db.voiceSession.update({ where: { id }, data: { status: 'ACTIVE', endedAt: null } });
  }
  interrupt(id: string) { return this.db.voiceSession.update({ where: { id }, data: { status: 'INTERRUPTED', endedAt: new Date() } }); }
  fail(id: string) { return this.db.voiceSession.update({ where: { id }, data: { status: 'FAILED', endedAt: new Date() } }); }

  recordUsage(input: { voiceSessionId: string; operation: 'STT' | 'TTS'; latencyMs: number; audioDurationMs?: number; characterCount?: number; failureCategory?: string }) {
    return this.db.voiceUsage.create({ data: { ...input, costStatus: 'COST_PENDING_PROVIDER_RECONCILIATION' } });
  }
}
