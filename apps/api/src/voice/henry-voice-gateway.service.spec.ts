import { HenryVoiceFormatter } from './henry-voice-formatter';
import { HenryVoiceGateway } from './henry-voice-gateway.service';

describe('HenryVoiceGateway', () => {
  const config = { maxAudioSize: 1024, maxDurationSeconds: 30, provider: 'elevenlabs', streamingEnabled: true, sttConfigured: () => true, ttsConfigured: () => true } as any;
  const audio = { buffer: Buffer.concat([Buffer.from('1a45dfa3', 'hex'), Buffer.alloc(20)]), mimetype: 'audio/webm', originalname: 'turn.webm', size: 24 };

  it('mantiene conversación, memoria y actor al enviar una entrada multimodal', async () => {
    const stt = { name: 'elevenlabs', isConfigured: () => true, transcribe: jest.fn().mockResolvedValue({ transcript: 'Prepárame para la reunión', provider: 'elevenlabs', language: 'es', durationMs: 1200 }) };
    const sessions = { start: jest.fn().mockResolvedValue({ id: 'session-1' }), recordUsage: jest.fn(), fail: jest.fn() };
    const henry = {
      resolveAuthorizedConversation: jest.fn().mockResolvedValue({ id: 'conversation-db' }),
      resolveRuntimeContext: jest.fn().mockResolvedValue({ role: 'CONSULTANT' }),
      sendVoice: jest.fn().mockResolvedValue({ data: { status: 'COMPLETED', message: { id: 'answer-1', content: 'Preparación' } } }),
    };
    const gateway = new HenryVoiceGateway(config, stt as any, {} as any, sessions as any, henry as any, new HenryVoiceFormatter());
    const actor = { id: 'user-1', permissions: ['henry.use_internal'] } as any;
    const result = await gateway.turn({ publicId: 'public-id', token: 'token', audio, durationMs: 1200, actor, pageContext: { pageType: 'prospect-detail', entityType: 'prospect', entityId: '90a74415-51c6-42c3-8846-24a4ff86d018' }, audit: {} });
    expect(result.data.transcript.transcript).toBe('Prepárame para la reunión');
    expect(sessions.start).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'conversation-db', roleContext: 'CONSULTANT' }));
    expect(henry.sendVoice).toHaveBeenCalledWith('public-id', 'token', expect.objectContaining({ content: 'Prepárame para la reunión' }), expect.any(Object), actor);
  });

  it('rechaza contenido disfrazado de audio antes de llamar al proveedor', async () => {
    const stt = { name: 'elevenlabs', transcribe: jest.fn() };
    const gateway = new HenryVoiceGateway(config, stt as any, {} as any, {} as any, {} as any, new HenryVoiceFormatter());
    await expect(gateway.turn({ publicId: 'id', audio: { ...audio, buffer: Buffer.from('<script>'), size: 8 }, audit: {} })).rejects.toMatchObject({ code: 'VOICE_AUDIO_INVALID' });
    expect(stt.transcribe).not.toHaveBeenCalled();
  });

  it('preserva fallback textual cuando TTS falla sin modificar el mensaje', async () => {
    const tts = { name: 'elevenlabs', synthesize: jest.fn().mockRejectedValue(Object.assign(new Error('down'), { code: 'VOICE_TTS_FAILED' })) };
    const sessions = { resume: jest.fn().mockResolvedValue({ id: 'session-1' }), recordUsage: jest.fn(), fail: jest.fn() };
    const henry = { getAuthorizedAssistantMessage: jest.fn().mockResolvedValue({ conversation: { id: 'conversation-db' }, message: { content: '**Respuesta segura.**' } }) };
    const gateway = new HenryVoiceGateway(config, {} as any, tts as any, sessions as any, henry as any, new HenryVoiceFormatter());
    await expect(gateway.speech({ publicId: 'id', messageId: 'message', voiceSessionId: 'session-1' })).rejects.toThrow('down');
    expect(tts.synthesize).toHaveBeenCalledWith(expect.objectContaining({ text: 'Respuesta segura.' }));
    expect(sessions.fail).toHaveBeenCalledWith('session-1');
  });
});
