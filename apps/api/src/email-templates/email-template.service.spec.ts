import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EmailTemplateRenderer } from './email-template.renderer';
import { EmailTemplateService } from './email-template.service';

describe('EmailTemplateService RBAC', () => {
  const db: any = {
    emailTemplate: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    emailTemplateVersion: { create: jest.fn(), findUnique: jest.fn() },
    emailTemplateVariant: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit: any = { record: jest.fn() },
    access: any = { teamMembers: jest.fn() };
  const service = new EmailTemplateService(
    db,
    audit,
    access,
    new EmailTemplateRenderer(),
    {} as any,
  );
  const consultant = {
    id: 'consultant',
    roles: ['CONSULTOR'],
    permissions: [
      'email_templates.read',
      'email_templates.create_personal',
      'email_templates.edit_personal',
      'email_templates.preview',
    ],
  };
  beforeEach(() => jest.clearAllMocks());

  it('impide que CONSULTOR cree o sobrescriba una master corporativa', async () => {
    await expect(service.create({ scope: 'CORPORATE' }, consultant, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(db.emailTemplate.create).not.toHaveBeenCalled();
  });
  it('impide modificar bloques protegidos desde una variante personal', async () => {
    db.emailTemplate.findFirst.mockResolvedValue({
      id: 'master',
      isCorporate: true,
      status: 'ACTIVE',
      activeVersionId: 'version',
      versions: [
        {
          id: 'version',
          blocks: [{ id: 'legal', type: 'LEGAL', mode: 'LOCKED', content: 'Aviso' }],
        },
      ],
    });
    await expect(
      service.createVariant(
        'master',
        { name: 'Personal', overrides: { legal: 'Eliminar' } },
        consultant,
        {},
      ),
    ).rejects.toThrow('EMAIL_TEMPLATE_BLOCK_LOCKED');
    expect(db.emailTemplateVariant.create).not.toHaveBeenCalled();
  });
  it('limita lectura de templates personales al propietario', async () => {
    db.emailTemplate.findFirst.mockResolvedValue(null);
    await expect(service.get('other-template', consultant)).rejects.toThrow(
      'EMAIL_TEMPLATE_NOT_FOUND',
    );
    expect(db.emailTemplate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ isCorporate: true }, { ownerId: { in: ['consultant'] } }],
        }),
      }),
    );
  });
  it('mantiene la búsqueda personal dentro del equipo explícitamente autorizado', async () => {
    access.teamMembers.mockResolvedValue([{ id: 'member-a' }]);
    db.emailTemplate.findMany.mockResolvedValue([]);
    await service.list(
      {
        ...consultant,
        id: 'manager',
        roles: ['GERENTE'],
        permissions: [...consultant.permissions, 'calendar.manage_team'],
      },
      { search: 'propuesta' },
    );
    expect(db.emailTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { OR: [{ isCorporate: true }, { ownerId: { in: ['manager', 'member-a'] } }] },
          ]),
        }),
      }),
    );
  });
  it('exige unsubscribe protegido para clasificaciones comerciales', async () => {
    db.emailTemplate.findFirst.mockResolvedValue({
      id: 'master',
      isCorporate: true,
      ownerId: null,
      locale: 'es-CO',
      versions: [],
    });
    await expect(
      service.createVersion(
        'master',
        {
          subject: 'Asunto',
          messageClassification: 'COMMERCIAL',
          blocks: [
            { id: 'body', type: 'BODY', mode: 'EDITABLE', content: '<p>Contenido</p>' },
            { id: 'footer', type: 'FOOTER', mode: 'LOCKED', content: '<p>HAVONA</p>' },
          ],
        },
        {
          ...consultant,
          permissions: [...consultant.permissions, 'email_templates.manage_corporate'],
        },
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.emailTemplateVersion.create).not.toHaveBeenCalled();
  });

  it('no activa una master editorialmente aprobada sin revisión legal humana', async () => {
    db.emailTemplate.findFirst.mockResolvedValue({
      id: 'master',
      isCorporate: true,
      versions: [{ id: 'version', status: 'APPROVED', legalStatus: 'LEGAL_REVIEW_REQUIRED' }],
    });
    await expect(
      service.activate(
        'master',
        {
          id: 'admin',
          roles: ['ADMIN'],
          permissions: ['email_templates.manage_corporate'],
        },
        {},
      ),
    ).rejects.toThrow('EMAIL_TEMPLATE_LEGAL_REVIEW_REQUIRED');
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('impide que un consultor conceda aprobación legal corporativa', async () => {
    await expect(
      service.recordLegalReview('version', { reference: 'LEGAL-1' }, consultant, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.emailTemplateVersion.findUnique).not.toHaveBeenCalled();
  });

  it('bloquea despacho automático para templates manuales o Henry-draft-only', async () => {
    await expect(
      service.assertAutomationDispatch('payment.failed', {
        evidence: ['AUTHORITATIVE_PAYMENT_FAILURE'],
        approvalMode: 'REQUIRES_CONFIRMATION',
      }),
    ).rejects.toThrow('EMAIL_TEMPLATE_AUTOMATION_NOT_ALLOWED');
    expect(db.emailTemplate.findFirst).not.toHaveBeenCalled();
  });

  it('no recomienda no-show sin evidencia explícita o del proveedor', async () => {
    db.emailTemplate.findMany.mockResolvedValue([]);
    const result = await service.recommend(consultant, {
      triggerEvent: 'MEETING_NO_SHOW_EVIDENCE',
      evidence: [],
    });
    expect(result).toEqual([]);
    expect(db.emailTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ key: { in: [] } }) }),
    );
  });
});
