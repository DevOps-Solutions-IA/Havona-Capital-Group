import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { HenryService } from '../henry/henry.service';
import { VoiceConfig } from './voice-config';
import { VoiceSessionService } from './voice-session.service';

type ChatMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content?: unknown };
export type ElevenLabsChatRequest = {
  model?: unknown;
  messages?: unknown;
  stream?: unknown;
  user_id?: unknown;
  elevenlabs_extra_body?: { externalConversationId?: unknown; consentAccepted?: unknown; privacyVersion?: unknown };
};

const safeEqual = (given: string, expected: string) => {
  const left = createHash('sha256').update(given).digest();
  const right = createHash('sha256').update(expected).digest();
  return timingSafeEqual(left, right) && Boolean(expected);
};

const deterministicMessageId = (externalId: string, messages: ChatMessage[]) => {
  const digest = createHash('sha256').update(externalId).update(JSON.stringify(messages.filter((message) => message.role !== 'system'))).digest('hex').slice(0, 32).split('');
  digest[12] = '4';
  digest[16] = ['8', '9', 'a', 'b'][parseInt(digest[16]!, 16) % 4]!;
  const value = digest.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
};

@Injectable()
export class ElevenLabsCustomLlmService {
  constructor(private readonly config: VoiceConfig, private readonly sessions: VoiceSessionService, private readonly henry: HenryService) {}

  authenticate(authorization?: string) {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!safeEqual(token, this.config.gatewaySecret)) throw new UnauthorizedException('VOICE_AUTH_FAILED');
  }

  async complete(body: ElevenLabsChatRequest, audit: { ipAddress?: string; userAgent?: string }) {
    const messages = Array.isArray(body.messages) ? body.messages as ChatMessage[] : [];
    if (!messages.length || messages.length > 80) throw new BadRequestException('Mensajes inválidos');
    const last = [...messages].reverse().find((message) => message?.role === 'user');
    if (!last || typeof last.content !== 'string' || !last.content.trim() || last.content.length > 4000) throw new BadRequestException('Mensaje de usuario inválido');
    const extra = body.elevenlabs_extra_body ?? {};
    const externalId = typeof extra.externalConversationId === 'string' ? extra.externalConversationId.trim() : typeof body.user_id === 'string' ? body.user_id.trim() : '';
    if (!externalId || externalId.length > 160) throw new BadRequestException('externalConversationId requerido');

    let session = await this.sessions.findExternal('elevenlabs', externalId);
    if (!session) {
      if (extra.consentAccepted !== true) throw new BadRequestException('Consentimiento de voz requerido');
      const privacyVersion = typeof extra.privacyVersion === 'string' && extra.privacyVersion.length <= 40 ? extra.privacyVersion : 'voice-privacy-v1';
      const created = await this.henry.createVoiceGatewayConversation({ channel: 'WEB', consent: { accepted: true, privacyVersion }, entryPoint: 'elevenlabs-custom-llm' }, audit);
      session = await this.sessions.start({ conversationId: created.conversation.id, provider: 'elevenlabs', externalConversationId: externalId, roleContext: 'PUBLIC', metadata: { channel: 'VOICE', source: 'CUSTOM_LLM', audioRetained: false } });
    }
    const result = await this.henry.sendTrustedGatewayVoice(session.conversationId, { messageId: deterministicMessageId(externalId, messages), content: last.content.trim() }, audit);
    const content = result.data.message?.content;
    if (!content) throw new BadRequestException('Henry no produjo una respuesta');
    return { content, conversationId: session.conversationId };
  }
}
