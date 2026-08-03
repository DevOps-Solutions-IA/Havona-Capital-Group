import { Injectable } from '@nestjs/common';
import { CommunicationsConfig } from './communications-config';
import {
  CommunicationError,
  EmailProvider,
  EmailSendInput,
  ProviderSendResult,
} from './communications.types';
@Injectable()
export class ResendEmailProvider implements EmailProvider {
  constructor(private readonly config: CommunicationsConfig) {}
  async send(input: EmailSendInput): Promise<ProviderSendResult> {
    if (!this.config.status().email.configured)
      throw new CommunicationError('CHANNEL_NOT_CONFIGURED', 'Resend no está configurado', 503);
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), this.config.resendTimeout);
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.config.resendApiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': input.idempotencyKey,
        },
        body: JSON.stringify({
          from: `${this.config.resendFromName} <${this.config.resendFromEmail}>`,
          to: [input.to],
          subject: input.subject,
          text: input.text,
          html: input.html,
          reply_to: input.replyTo || this.config.resendReplyTo || undefined,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!response.ok || !data.id)
        throw new CommunicationError(
          'EMAIL_DELIVERY_FAILED',
          `Resend rechazó el envío (${response.status})`,
          response.status || 502,
        );
      return { providerMessageId: data.id, acceptedAt: new Date() };
    } catch (error) {
      if (error instanceof CommunicationError) throw error;
      if ((error as Error).name === 'AbortError')
        throw new CommunicationError(
          'PROVIDER_UNAVAILABLE',
          'Resend agotó el tiempo de espera',
          504,
        );
      throw new CommunicationError('PROVIDER_UNAVAILABLE', 'Resend no está disponible', 503);
    } finally {
      clearTimeout(timer);
    }
  }
}
