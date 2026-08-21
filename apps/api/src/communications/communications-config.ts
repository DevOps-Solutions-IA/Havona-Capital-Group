import { Injectable } from '@nestjs/common';
import { isAuthorizedResendSender } from '@havona/shared';
@Injectable()
export class CommunicationsConfig {
  readonly whatsappProvider = process.env.WHATSAPP_PROVIDER ?? 'meta';
  readonly metaEnabled = process.env.META_WHATSAPP_ENABLED === 'true';
  readonly metaVersion = process.env.META_WHATSAPP_API_VERSION ?? 'v23.0';
  readonly metaPhoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID ?? '';
  readonly metaBusinessAccountId = process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID ?? '';
  readonly metaAccessToken = process.env.META_WHATSAPP_ACCESS_TOKEN ?? '';
  readonly metaAppSecret = process.env.META_WHATSAPP_APP_SECRET ?? '';
  readonly metaVerifyToken = process.env.META_WHATSAPP_VERIFY_TOKEN ?? '';
  readonly metaBaseUrl = (
    process.env.META_WHATSAPP_BASE_URL ?? 'https://graph.facebook.com'
  ).replace(/\/$/, '');
  readonly metaTimeout = Number(process.env.META_WHATSAPP_REQUEST_TIMEOUT_MS ?? 15000);
  readonly emailProvider = process.env.EMAIL_PROVIDER ?? 'resend';
  readonly resendEnabled = process.env.RESEND_ENABLED === 'true';
  readonly resendApiKey = process.env.RESEND_API_KEY ?? '';
  readonly resendFromEmail = process.env.RESEND_FROM_EMAIL ?? '';
  readonly resendFromName = process.env.RESEND_FROM_NAME ?? 'HAVONA CAPITAL GROUP';
  readonly resendReplyTo = process.env.RESEND_REPLY_TO ?? '';
  readonly resendWebhookSecret = process.env.RESEND_WEBHOOK_SECRET ?? '';
  readonly resendTimeout = Number(process.env.RESEND_REQUEST_TIMEOUT_MS ?? 15000);
  readonly queueName = process.env.COMMUNICATIONS_QUEUE_NAME ?? 'havona-communications';
  readonly redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  readonly attachmentMaxSize = Number(process.env.COMMUNICATIONS_ATTACHMENT_MAX_SIZE ?? 10485760);
  status() {
    return {
      whatsapp: {
        provider: 'META',
        enabled: this.metaEnabled,
        configured: Boolean(
          this.metaEnabled &&
          this.metaPhoneNumberId &&
          this.metaAccessToken &&
          this.metaAppSecret &&
          this.metaVerifyToken,
        ),
        webhookReady: Boolean(this.metaEnabled && this.metaAppSecret && this.metaVerifyToken),
      },
      email: {
        provider: 'RESEND',
        enabled: this.resendEnabled,
        configured: Boolean(
          this.emailProvider === 'resend' &&
          this.resendEnabled &&
          this.resendApiKey &&
          this.resendFromEmail &&
          isAuthorizedResendSender(this.resendFromEmail),
        ),
        webhookReady: Boolean(this.resendEnabled && this.resendWebhookSecret),
        inboundEnabled: false,
      },
    };
  }
}
