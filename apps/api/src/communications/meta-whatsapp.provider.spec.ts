import { MetaWhatsAppProvider } from './meta-whatsapp.provider';
describe('MetaWhatsAppProvider', () => {
  const config: any = {
    metaBaseUrl: 'https://graph.facebook.com',
    metaVersion: 'v23.0',
    metaPhoneNumberId: 'phone',
    metaAccessToken: 'never-log-this',
    metaTimeout: 1000,
    status: () => ({ whatsapp: { configured: true } }),
  };
  afterEach(() => jest.restoreAllMocks());
  it('mapea texto al contrato Cloud API sin filtrar credenciales', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 }),
      );
    await expect(
      new MetaWhatsAppProvider(config).sendText({
        to: '+573001112233',
        text: 'Hola',
        idempotencyKey: 'key',
      }),
    ).resolves.toMatchObject({ providerMessageId: 'wamid.1' });
    const request = fetchMock.mock.calls[0]!;
    expect(request[0]).toBe('https://graph.facebook.com/v23.0/phone/messages');
    expect(JSON.parse(String((request[1] as RequestInit).body))).toMatchObject({
      type: 'text',
      to: '+573001112233',
    });
  });
  it('sanitiza errores sin exponer token', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error(`network ${config.metaAccessToken}`));
    await expect(
      new MetaWhatsAppProvider(config).sendText({
        to: '+573001112233',
        text: 'Hola',
        idempotencyKey: 'key',
      }),
    ).rejects.not.toThrow(config.metaAccessToken);
  });
});
