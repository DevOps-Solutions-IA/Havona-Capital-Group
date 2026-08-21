import { VoiceConfig } from './voice-config';
import { ElevenLabsProvider } from './elevenlabs.provider';

describe('ElevenLabsProvider', () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env.VOICE_PROVIDER = 'elevenlabs';
    process.env.ELEVENLABS_API_KEY = 'test-secret-never-log';
    process.env.ELEVENLABS_VOICE_ID = 'voice-id';
    process.env.ELEVENLABS_TTS_MODEL = 'eleven_multilingual_v2';
    process.env.ELEVENLABS_STT_MODEL = 'scribe_v1';
    process.env.ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';
  });
  afterEach(() => { process.env = { ...original }; jest.restoreAllMocks(); });

  it('envía STT multipart al endpoint oficial sin exponer la clave', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation();
    const warning = jest.spyOn(console, 'warn').mockImplementation();
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ text: 'Hola Henry', language_code: 'es' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const provider = new ElevenLabsProvider(new VoiceConfig());
    const bytes = Buffer.from('1a45dfa3', 'hex');
    await expect(provider.transcribe({ bytes, mimeType: 'audio/webm', filename: 'voice.webm' })).resolves.toMatchObject({ transcript: 'Hola Henry', language: 'es', provider: 'elevenlabs' });
    expect(fetchSpy).toHaveBeenCalledWith('https://api.elevenlabs.io/v1/speech-to-text', expect.objectContaining({ method: 'POST' }));
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
    expect(`${info.mock.calls.flat().join(' ')}${warning.mock.calls.flat().join(' ')}`).not.toContain('test-secret-never-log');
  });

  it('solicita TTS en streaming y conserva el contenido semántico', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } }));
    const provider = new ElevenLabsProvider(new VoiceConfig());
    const result = await provider.synthesize({ text: 'No existe garantía.' });
    expect(result.contentType).toBe('audio/mpeg');
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice-id/stream');
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({ text: 'No existe garantía.', model_id: 'eleven_multilingual_v2' });
  });

  it('mapea timeout y nunca incorpora el secreto en el error', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(Object.assign(new Error('test-secret-never-log'), { name: 'AbortError' }));
    const provider = new ElevenLabsProvider(new VoiceConfig());
    const promise = provider.synthesize({ text: 'Hola' });
    await expect(promise).rejects.toMatchObject({ code: 'VOICE_TIMEOUT' });
    await expect(promise).rejects.not.toThrow(/test-secret-never-log/);
  });
});
