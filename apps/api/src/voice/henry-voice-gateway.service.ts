import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { HenryPageContextInput } from '@havona/contracts';
import { AuditContext } from '../audit/audit.service';
import { HenryActor } from '../henry/henry-context.service';
import { HenryService } from '../henry/henry.service';
import { HenryVoiceFormatter, VoiceDetail } from './henry-voice-formatter';
import { VoiceConfig } from './voice-config';
import { VoiceSessionService } from './voice-session.service';
import { VOICE_STT_PROVIDER, VOICE_TTS_PROVIDER, VoiceProviderError, VoiceSTTProvider, VoiceTTSProvider } from './voice-provider';

const allowedMime = new Set(['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav']);
const looksLikeAudio = (bytes: Buffer, mime: string) => {
  if (mime.includes('webm')) return bytes.subarray(0, 4).toString('hex') === '1a45dfa3';
  if (mime.includes('ogg')) return bytes.subarray(0, 4).toString() === 'OggS';
  if (mime.includes('wav')) return bytes.subarray(0, 4).toString() === 'RIFF';
  if (mime.includes('mpeg')) return bytes.subarray(0, 3).toString() === 'ID3' || bytes[0] === 0xff;
  if (mime.includes('mp4')) return bytes.subarray(4, 8).toString() === 'ftyp';
  return false;
};

@Injectable()
export class HenryVoiceGateway {
  constructor(
    private readonly config: VoiceConfig,
    @Inject(VOICE_STT_PROVIDER) private readonly stt: VoiceSTTProvider,
    @Inject(VOICE_TTS_PROVIDER) private readonly tts: VoiceTTSProvider,
    private readonly sessions: VoiceSessionService,
    private readonly henry: HenryService,
    private readonly formatter: HenryVoiceFormatter,
  ) {}

  configuration() { return { provider: this.config.provider, stt: this.config.sttConfigured(), tts: this.config.ttsConfigured(), streaming: this.config.streamingEnabled }; }

  async turn(input: { publicId: string; token?: string; audio: { buffer: Buffer; mimetype: string; originalname: string; size: number }; durationMs?: number; pageContext?: HenryPageContextInput; actor?: HenryActor; audit: AuditContext }) {
    this.validateAudio(input.audio, input.durationMs);
    const conversation = await this.henry.resolveAuthorizedConversation(input.publicId, input.token, input.actor);
    const resolved = await this.henry.resolveRuntimeContext(input.pageContext, input.actor);
    const role = resolved.role;
    const session = await this.sessions.start({ conversationId: conversation.id, provider: this.stt.name, authenticatedUserId: input.actor?.id, roleContext: role, metadata: { channel: 'VOICE', audioRetained: false } });
    const started = Date.now();
    try {
      const transcript = await this.stt.transcribe({ bytes: input.audio.buffer, mimeType: input.audio.mimetype, filename: input.audio.originalname || 'voice.webm', durationMs: input.durationMs });
      if (transcript.durationMs && transcript.durationMs > this.config.maxDurationSeconds * 1000) throw new VoiceProviderError('VOICE_AUDIO_TOO_LONG', 'El audio supera la duración permitida');
      await this.sessions.recordUsage({ voiceSessionId: session.id, operation: 'STT', latencyMs: Date.now() - started, audioDurationMs: transcript.durationMs ?? input.durationMs, characterCount: transcript.transcript.length });
      const result = await this.henry.sendVoice(input.publicId, input.token, { messageId: randomUUID(), content: transcript.transcript, pageContext: input.pageContext }, input.audit, input.actor);
      return { data: { voiceSessionId: session.id, transcript, ...result.data } };
    } catch (error) {
      await this.sessions.recordUsage({ voiceSessionId: session.id, operation: 'STT', latencyMs: Date.now() - started, audioDurationMs: input.durationMs, failureCategory: error instanceof VoiceProviderError ? error.code : 'VOICE_STT_FAILED' });
      await this.sessions.fail(session.id);
      throw error;
    }
  }

  async speech(input: { publicId: string; token?: string; messageId: string; voiceSessionId: string; actor?: HenryActor; detail?: VoiceDetail; signal?: AbortSignal }) {
    const { conversation, message } = await this.henry.getAuthorizedAssistantMessage(input.publicId, input.token, input.messageId, input.actor);
    const session = await this.sessions.resume(input.voiceSessionId, conversation.id);
    if (!session) throw new BadRequestException('Sesión de voz inválida');
    const text = this.formatter.format(message.content, input.detail);
    const started = Date.now();
    try {
      const result = await this.tts.synthesize({ text, signal: input.signal });
      await this.sessions.recordUsage({ voiceSessionId: session.id, operation: 'TTS', latencyMs: Date.now() - started, characterCount: text.length });
      await this.sessions.complete(session.id);
      return result;
    } catch (error) {
      await this.sessions.recordUsage({ voiceSessionId: session.id, operation: 'TTS', latencyMs: Date.now() - started, characterCount: text.length, failureCategory: error instanceof VoiceProviderError ? error.code : 'VOICE_TTS_FAILED' });
      await this.sessions.fail(session.id);
      throw error;
    }
  }

  private validateAudio(file: { buffer: Buffer; mimetype: string; size: number }, durationMs?: number) {
    const mime = file.mimetype.split(';')[0]!.toLowerCase();
    if (!allowedMime.has(mime) || !looksLikeAudio(file.buffer, mime)) throw new VoiceProviderError('VOICE_AUDIO_INVALID', 'El archivo no contiene audio permitido');
    if (file.size > this.config.maxAudioSize) throw new VoiceProviderError('VOICE_AUDIO_TOO_LARGE', 'El audio supera el tamaño permitido');
    if (durationMs && durationMs > this.config.maxDurationSeconds * 1000) throw new VoiceProviderError('VOICE_AUDIO_TOO_LONG', 'El audio supera la duración permitida');
    if (!file.buffer.length) throw new BadRequestException('El audio está vacío');
  }
}
