import { Injectable } from '@nestjs/common';

const positive = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const voiceMaxAudioSizeFromEnv = () => positive(process.env.VOICE_MAX_AUDIO_SIZE, 10 * 1024 * 1024);

@Injectable()
export class VoiceConfig {
  readonly provider = (process.env.VOICE_PROVIDER ?? 'elevenlabs').trim().toLowerCase();
  readonly apiKey = process.env.ELEVENLABS_API_KEY?.trim() ?? '';
  readonly voiceId = process.env.ELEVENLABS_VOICE_ID?.trim() ?? '';
  readonly ttsModel = process.env.ELEVENLABS_TTS_MODEL?.trim() || 'eleven_multilingual_v2';
  readonly sttModel = process.env.ELEVENLABS_STT_MODEL?.trim() || 'scribe_v1';
  readonly baseUrl = (process.env.ELEVENLABS_BASE_URL?.trim() || 'https://api.elevenlabs.io/v1').replace(/\/$/, '');
  readonly gatewaySecret = process.env.ELEVENLABS_HENRY_GATEWAY_SECRET?.trim() ?? '';
  readonly maxAudioSize = voiceMaxAudioSizeFromEnv();
  readonly maxDurationSeconds = positive(process.env.VOICE_MAX_DURATION_SECONDS, 120);
  readonly timeoutMs = positive(process.env.VOICE_REQUEST_TIMEOUT_MS, 30_000);
  readonly streamingEnabled = process.env.VOICE_STREAMING_ENABLED !== 'false';
  readonly audioRetentionEnabled = process.env.VOICE_AUDIO_RETENTION_ENABLED === 'true';

  providerConfigured() { return this.provider === 'elevenlabs' && Boolean(this.apiKey); }
  sttConfigured() { return this.providerConfigured() && Boolean(this.sttModel); }
  ttsConfigured() { return this.providerConfigured() && Boolean(this.voiceId && this.ttsModel); }
}
