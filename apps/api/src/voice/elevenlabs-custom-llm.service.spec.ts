import { ElevenLabsCustomLlmService } from './elevenlabs-custom-llm.service';

describe('ElevenLabsCustomLlmService', () => {
  const service = () => new ElevenLabsCustomLlmService(
    { gatewaySecret: 'gateway-secret' } as any,
    { findExternal: jest.fn() } as any,
    {} as any,
  );

  it('usa autenticación M2M independiente y comparación constante', () => {
    expect(() => service().authenticate('Bearer gateway-secret')).not.toThrow();
    expect(() => service().authenticate('Bearer invalid')).toThrow('VOICE_AUTH_FAILED');
    expect(() => service().authenticate()).toThrow('VOICE_AUTH_FAILED');
  });

  it('rechaza payloads sin un turno de usuario antes de tocar Henry Core', async () => {
    await expect(service().complete({ messages: [{ role: 'assistant', content: 'Hola' }], stream: true, user_id: 'external-1' }, {})).rejects.toThrow('Mensaje de usuario inválido');
  });

  it('genera un messageId estable para que los reintentos externos sean idempotentes', async () => {
    const sessions = { findExternal: jest.fn().mockResolvedValue({ conversationId: 'conversation-1' }) };
    const henry = { sendTrustedGatewayVoice: jest.fn().mockResolvedValue({ data: { message: { content: 'Respuesta segura' } } }) };
    const gateway = new ElevenLabsCustomLlmService({ gatewaySecret: 'gateway-secret' } as any, sessions as any, henry as any);
    const body = { messages: [{ role: 'user' as const, content: 'Hola Henry' }], stream: true, user_id: 'external-1' };
    await gateway.complete(body, {});
    await gateway.complete(body, {});
    const firstId = henry.sendTrustedGatewayVoice.mock.calls[0][1].messageId;
    const secondId = henry.sendTrustedGatewayVoice.mock.calls[1][1].messageId;
    expect(firstId).toMatch(/^[0-9a-f-]{36}$/);
    expect(secondId).toBe(firstId);
  });
});
