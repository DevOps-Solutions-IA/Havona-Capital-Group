import { Injectable } from '@nestjs/common';
import { CommunicationsConfig } from './communications-config';
import {
  CommunicationError,
  MessagingProvider,
  ProviderSendResult,
  WhatsAppTemplateInput,
  WhatsAppTextInput,
} from './communications.types';

@Injectable()
export class MetaWhatsAppProvider implements MessagingProvider {
  constructor(private readonly config: CommunicationsConfig) {}
  sendText(input: WhatsAppTextInput) {
    return this.send(
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: input.to,
        type: 'text',
        text: { preview_url: false, body: input.text },
      },
      input.idempotencyKey,
    );
  }
  sendTemplate(input: WhatsAppTemplateInput) {
    return this.send(
      {
        messaging_product: 'whatsapp',
        to: input.to,
        type: 'template',
        template: {
          name: input.template,
          language: { code: input.language },
          components: input.parameters.length
            ? [
                {
                  type: 'body',
                  parameters: input.parameters.map((text) => ({ type: 'text', text })),
                },
              ]
            : [],
        },
      },
      input.idempotencyKey,
    );
  }
  private async send(
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<ProviderSendResult> {
    const status = this.config.status().whatsapp;
    if (!status.configured)
      throw new CommunicationError(
        'CHANNEL_NOT_CONFIGURED',
        'WhatsApp Meta no está configurado',
        503,
      );
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), this.config.metaTimeout);
    try {
      const response = await fetch(
        `${this.config.metaBaseUrl}/${this.config.metaVersion}/${this.config.metaPhoneNumberId}/messages`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${this.config.metaAccessToken}`,
            'Content-Type': 'application/json',
            'X-Havona-Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify(payload),
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        messages?: { id: string }[];
        error?: { code?: number; message?: string };
      };
      if (!response.ok || !data.messages?.[0]?.id)
        throw new CommunicationError(
          'MESSAGE_SEND_FAILED',
          `Meta rechazó el envío (${data.error?.code ?? response.status})`,
          response.status || 502,
        );
      return { providerMessageId: data.messages[0].id, acceptedAt: new Date() };
    } catch (error) {
      if (error instanceof CommunicationError) throw error;
      if ((error as Error).name === 'AbortError')
        throw new CommunicationError('PROVIDER_UNAVAILABLE', 'Meta agotó el tiempo de espera', 504);
      throw new CommunicationError('PROVIDER_UNAVAILABLE', 'Meta WhatsApp no está disponible', 503);
    } finally {
      clearTimeout(timer);
    }
  }
}
