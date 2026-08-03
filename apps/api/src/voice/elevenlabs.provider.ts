import { Injectable } from '@nestjs/common';
import { VoiceConfig } from './voice-config';
import { VoiceAudio, VoiceProviderError, VoiceSTTProvider, VoiceSynthesis, VoiceSynthesisRequest, VoiceTTSProvider } from './voice-provider';

const safeProviderMessage = (value: unknown) => typeof value === 'string' ? value.replace(/\s+/g, ' ').slice(0, 240) : '';

@Injectable()
export class ElevenLabsProvider implements VoiceSTTProvider, VoiceTTSProvider {
  readonly name = 'elevenlabs';
  constructor(private readonly config: VoiceConfig) {}
  isConfigured() { return this.config.providerConfigured(); }

  async transcribe(audio: VoiceAudio) {
    if (!this.config.sttConfigured()) throw new VoiceProviderError('VOICE_CONFIGURATION_REQUIRED', 'Speech-to-Text no está configurado');
    const form = new FormData();
    form.append('model_id', this.config.sttModel);
    const bytes = Uint8Array.from(audio.bytes);
    form.append('file', new Blob([bytes], { type: audio.mimeType }), audio.filename);
    const response = await this.request(`${this.config.baseUrl}/speech-to-text`, { method: 'POST', body: form, signal: audio.signal }, 'VOICE_STT_FAILED');
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (typeof payload.text !== 'string' || !payload.text.trim()) throw new VoiceProviderError('VOICE_STT_FAILED', 'ElevenLabs no devolvió una transcripción válida');
    return {
      transcript: payload.text.trim(), provider: this.name,
      language: typeof payload.language_code === 'string' ? payload.language_code : undefined,
      durationMs: typeof payload.audio_duration === 'number' ? Math.round(payload.audio_duration * 1000) : audio.durationMs,
      languageConfidence: typeof payload.language_probability === 'number' ? payload.language_probability : undefined,
    };
  }

  async synthesize(request: VoiceSynthesisRequest): Promise<VoiceSynthesis> {
    if (!this.config.ttsConfigured()) throw new VoiceProviderError('VOICE_CONFIGURATION_REQUIRED', 'Text-to-Speech no está configurado');
    const endpoint = `${this.config.baseUrl}/text-to-speech/${encodeURIComponent(this.config.voiceId)}/stream`;
    const response = await this.request(endpoint, {
      method: 'POST', signal: request.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: request.text, model_id: this.config.ttsModel, output_format: 'mp3_44100_128' }),
    }, 'VOICE_TTS_FAILED');
    if (!response.body) throw new VoiceProviderError('VOICE_STREAM_FAILED', 'ElevenLabs no devolvió un stream de audio');
    return { audio: response.body, contentType: response.headers.get('content-type') || 'audio/mpeg', provider: this.name };
  }

  private async request(endpoint: string, init: RequestInit, failureCode: 'VOICE_STT_FAILED' | 'VOICE_TTS_FAILED') {
    const timeout = AbortSignal.timeout(this.config.timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await fetch(endpoint, { ...init, signal, headers: { 'xi-api-key': this.config.apiKey, ...(init.headers ?? {}) } });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new VoiceProviderError(timedOut ? 'VOICE_TIMEOUT' : 'VOICE_PROVIDER_UNAVAILABLE', timedOut ? 'ElevenLabs excedió el tiempo permitido' : 'ElevenLabs no está disponible', !timedOut);
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { detail?: { message?: unknown } | string };
      const detail = typeof payload.detail === 'string' ? payload.detail : payload.detail?.message;
      const message = safeProviderMessage(detail) || `ElevenLabs rechazó la solicitud (${response.status})`;
      const code = response.status === 429 ? 'VOICE_RATE_LIMITED' : response.status === 401 || response.status === 403 ? 'VOICE_AUTH_FAILED' : failureCode;
      throw new VoiceProviderError(code, message, response.status === 429 || response.status >= 500);
    }
    return response;
  }
}
