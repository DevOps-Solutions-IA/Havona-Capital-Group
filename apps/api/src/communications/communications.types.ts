export const MESSAGING_PROVIDER = Symbol('MESSAGING_PROVIDER');
export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

export type ProviderSendResult = { providerMessageId: string; acceptedAt: Date };
export type WhatsAppTextInput = { to: string; text: string; idempotencyKey: string };
export type WhatsAppTemplateInput = {
  to: string;
  template: string;
  language: string;
  parameters: string[];
  idempotencyKey: string;
};
export type EmailSendInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  idempotencyKey: string;
};

export interface MessagingProvider {
  sendText(input: WhatsAppTextInput): Promise<ProviderSendResult>;
  sendTemplate(input: WhatsAppTemplateInput): Promise<ProviderSendResult>;
}
export interface EmailProvider {
  send(input: EmailSendInput): Promise<ProviderSendResult>;
}

export class CommunicationError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
