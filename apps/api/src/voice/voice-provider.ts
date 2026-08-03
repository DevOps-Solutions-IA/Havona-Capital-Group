export type VoiceErrorCode =
  | 'VOICE_CONFIGURATION_REQUIRED' | 'VOICE_PROVIDER_UNAVAILABLE' | 'VOICE_STT_FAILED'
  | 'VOICE_TTS_FAILED' | 'VOICE_STREAM_FAILED' | 'VOICE_AUDIO_INVALID'
  | 'VOICE_AUDIO_TOO_LARGE' | 'VOICE_AUDIO_TOO_LONG' | 'VOICE_AUTH_FAILED'
  | 'VOICE_RATE_LIMITED' | 'VOICE_TIMEOUT';

export class VoiceProviderError extends Error {
  constructor(readonly code: VoiceErrorCode, message: string, readonly retryable = false) {
    super(message);
    this.name = 'VoiceProviderError';
  }
}

export type VoiceAudio = { bytes: Buffer; mimeType: string; filename: string; durationMs?: number; signal?: AbortSignal };
export type VoiceTranscript = { transcript: string; language?: string; durationMs?: number; languageConfidence?: number; provider: string };
export type VoiceSynthesisRequest = { text: string; signal?: AbortSignal };
export type VoiceSynthesis = { audio: ReadableStream<Uint8Array>; contentType: string; provider: string };

export interface VoiceSTTProvider {
  readonly name: string;
  isConfigured(): boolean;
  transcribe(audio: VoiceAudio): Promise<VoiceTranscript>;
}

export interface VoiceTTSProvider {
  readonly name: string;
  isConfigured(): boolean;
  synthesize(request: VoiceSynthesisRequest): Promise<VoiceSynthesis>;
}

export interface VoiceStreamingProvider {
  cancel(sessionId: string): Promise<void>;
}

export const VOICE_STT_PROVIDER = Symbol('VOICE_STT_PROVIDER');
export const VOICE_TTS_PROVIDER = Symbol('VOICE_TTS_PROVIDER');
