import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { HenryMessagingOperatorService } from './henry-messaging-operator.service';

describe('HenryMessagingOperatorService', () => {
  const preview = {
    checksum: 'a'.repeat(64),
    missingVariables: [],
    variablesResolved: { 'client.email': 'laura@example.com' },
    attachmentReferences: [],
    templateVersionId: '11111111-1111-4111-8111-111111111111',
    subject: 'Seguimiento',
    text: 'Hola Laura',
    html: '<p>Hola Laura</p>',
    messageClassification: 'RELATIONSHIP',
  };
  const db: any = {
    conversation: { findFirst: jest.fn(), findUnique: jest.fn() },
    conversationState: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
    conversationParticipant: { findFirst: jest.fn() },
    prospect: { findMany: jest.fn(), findUnique: jest.fn() },
    emailTemplateDraft: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
    emailTemplate: { findUniqueOrThrow: jest.fn() },
    emailTemplateVersion: { findUniqueOrThrow: jest.fn() },
    emailTemplateUsage: { update: jest.fn() },
    henryMessagingOperation: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
    communicationMessage: { findUnique: jest.fn() },
    assignment: { findFirst: jest.fn() },
    task: { create: jest.fn() },
    user: { findUniqueOrThrow: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit: any = { record: jest.fn() },
    access: any = { authorizeRelations: jest.fn() };
  const templates: any = {
    preview: jest.fn(),
    updateDraft: jest.fn(),
    createDraft: jest.fn(),
    createAdHocDraft: jest.fn(),
    recommend: jest.fn(),
    handoff: jest.fn(),
  };
  const communications: any = { get: jest.fn(), resolveEmailThread: jest.fn(), send: jest.fn() };
  const queue: any = { scheduleMessagingOperation: jest.fn(), cancelMessagingOperation: jest.fn() };
  const service = new HenryMessagingOperatorService(
    db,
    audit,
    access,
    templates,
    communications,
    queue,
  );
  const actor = {
    id: 'actor',
    roles: ['CONSULTOR'],
    permissions: ['communications.send', 'email_templates.preview'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    templates.preview.mockResolvedValue(preview);
    db.emailTemplateDraft.findUnique.mockResolvedValue({
      id: 'draft',
      communicationThreadId: 'thread',
      attachmentReferences: [],
    });
    db.$transaction.mockImplementation((items: Promise<unknown>[]) => Promise.all(items));
  });

  it.each([
    ['Prepara un correo para Laura', 'EMAIL_DRAFT'],
    ['Hazlo más corto', 'EMAIL_EDIT'],
    ['Envíale ese correo', 'EMAIL_SEND'],
    ['Programa el correo para mañana', 'EMAIL_SCHEDULE'],
    ['Adjunta la propuesta', 'EMAIL_ATTACH'],
    ['Responde este correo', 'EMAIL_REPLY'],
    ['Cancela el correo programado', 'EMAIL_CANCEL_SCHEDULED'],
  ])('detecta intent gobernado: %s', (text, expected) =>
    expect(service.detectIntent(text)).toBe(expected),
  );

  it('no elige arbitrariamente un destinatario ambiguo', async () => {
    db.conversation.findUnique.mockResolvedValue({
      id: 'conversation',
      prospectId: null,
      state: { state: {} },
    });
    db.prospect.findMany.mockResolvedValue([
      { id: '1', name: 'Carlos Uno', normalizedEmail: 'uno@example.com' },
      { id: '2', name: 'Carlos Dos', normalizedEmail: 'dos@example.com' },
    ]);
    await expect(
      service.resolveRecipient(actor, 'conversation', { name: 'Carlos' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'EMAIL_RECIPIENT_AMBIGUOUS' }),
    });
  });

  it('liga confirmación a draft, checksum, destinatario y adjuntos con expiración', async () => {
    db.henryMessagingOperation.upsert.mockImplementation(({ create }: any) =>
      Promise.resolve({ id: 'operation', ...create }),
    );
    const result = await service.requestConfirmation(
      actor,
      'conversation',
      { draftId: 'draft', intent: 'EMAIL_SEND' },
      {},
    );
    expect(result).toEqual(
      expect.objectContaining({
        operationId: 'operation',
        recipient: 'laura@example.com',
        confirmationRequired: true,
      }),
    );
    expect(db.henryMessagingOperation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          renderChecksum: preview.checksum,
          recipientIdentity: 'laura@example.com',
          confirmationLevel: 'ALWAYS_CONFIRM',
        }),
      }),
    );
  });

  it('invalida confirmación cuando cambia el render y no despacha', async () => {
    db.henryMessagingOperation.findUnique.mockResolvedValue({
      id: 'operation',
      actorId: actor.id,
      status: 'AWAITING_CONFIRMATION',
      confirmationExpiresAt: new Date(Date.now() + 60_000),
      draftId: 'draft',
      renderChecksum: 'b'.repeat(64),
      attachmentChecksum: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
      recipientIdentity: 'laura@example.com',
    });
    await expect(service.confirm(actor, 'operation', {})).rejects.toThrow(
      'EMAIL_CONFIRMATION_STALE',
    );
    expect(communications.send).not.toHaveBeenCalled();
  });

  it('bloquea replay o acceso cruzado por actor', async () => {
    db.henryMessagingOperation.findUnique.mockResolvedValue({ id: 'operation', actorId: 'other' });
    await expect(service.status(actor, 'operation')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rechaza confirmación expirada sin usar force exit ni enviar', async () => {
    db.henryMessagingOperation.findUnique.mockResolvedValue({
      id: 'operation',
      actorId: actor.id,
      status: 'AWAITING_CONFIRMATION',
      confirmationExpiresAt: new Date(0),
    });
    db.henryMessagingOperation.update.mockResolvedValue({});
    await expect(service.confirm(actor, 'operation', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(communications.send).not.toHaveBeenCalled();
  });
});
