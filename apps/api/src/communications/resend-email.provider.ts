import { Injectable } from '@nestjs/common';
import { ResendTransportError, sendResendEmail } from '@havona/shared';
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
    try {
      return await sendResendEmail({
        apiKey: this.config.resendApiKey,
        fromEmail: this.config.resendFromEmail,
        fromName: this.config.resendFromName,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        replyTo: input.replyTo || this.config.resendReplyTo || undefined,
        attachments: input.attachments,
        idempotencyKey: input.idempotencyKey,
        timeoutMs: this.config.resendTimeout,
      });
    } catch (error) {
      if (error instanceof ResendTransportError)
        throw new CommunicationError(
          error.retryable ? 'PROVIDER_UNAVAILABLE' : 'EMAIL_DELIVERY_FAILED',
          error.retryable ? 'Resend no está disponible temporalmente' : 'Resend rechazó el envío',
          error.httpStatus ?? 502,
        );
      throw new CommunicationError('PROVIDER_UNAVAILABLE', 'Resend no está disponible', 503);
    }
  }
}
