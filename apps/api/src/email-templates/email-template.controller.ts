import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { EmailTemplateService } from './email-template.service';

const uuid = z.string().uuid();
const audit = (req: any) => ({
  actorUserId: req.auth.user.id,
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
});
const block = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9_-]+$/)
      .max(80),
    type: z.enum([
      'HEADER',
      'INTRODUCTION',
      'BODY',
      'BENEFITS',
      'CTA',
      'APPOINTMENT',
      'DOCUMENTS',
      'SIGNATURE',
      'LEGAL',
      'UNSUBSCRIBE',
      'FOOTER',
    ]),
    mode: z.enum(['EDITABLE', 'STRUCTURED_EDITABLE', 'FREE_EDITABLE', 'LOCKED', 'REQUIRED']),
    content: z.string().min(1).max(20000),
  })
  .strict();
const createTemplate = z
  .object({
    key: z
      .string()
      .regex(/^[a-z0-9_.-]+$/)
      .max(160),
    name: z.string().min(3).max(200),
    description: z.string().max(1000).optional(),
    category: z.string().min(2).max(60),
    purpose: z.string().min(2).max(120),
    lifecycleStage: z.string().max(80).optional(),
    scope: z.enum(['CORPORATE', 'PERSONAL']),
    locale: z.enum(['es-CO', 'en-US']).default('es-CO'),
    tags: z.array(z.string().max(50)).max(20).default([]),
  })
  .strict();
const createVersion = z
  .object({
    subject: z.string().min(1).max(300),
    preheader: z.string().max(300).optional(),
    blocks: z.array(block).min(1).max(30),
    requiredVariables: z.array(z.string().max(100)).max(30).optional(),
    messageClassification: z.enum([
      'TRANSACTIONAL',
      'RELATIONSHIP',
      'SERVICE',
      'COMMERCIAL',
      'MARKETING',
    ]),
    subjectAlternatives: z.array(z.string().min(1).max(300)).max(3).optional(),
    contentPolicy: z.record(z.unknown()).optional(),
    legalStatus: z.literal('LEGAL_REVIEW_REQUIRED').default('LEGAL_REVIEW_REQUIRED'),
  })
  .strict();
const draft = z
  .object({
    ownerId: uuid.optional(),
    templateId: uuid.optional(),
    templateVersionId: uuid.optional(),
    variantId: uuid.optional(),
    recipientProspectId: uuid.optional(),
    companyId: uuid.optional(),
    opportunityId: uuid.optional(),
    communicationThreadId: uuid.optional(),
    calendarEventId: uuid.optional(),
    meetingId: uuid.optional(),
    subjectOverride: z.string().max(300).optional(),
    editableBlockOverrides: z.record(z.string().max(20000)).optional(),
    attachmentReferences: z
      .array(
        z.object({ type: z.enum(['KNOWLEDGE_DOCUMENT', 'COMMUNICATION_ATTACHMENT']), id: uuid }),
      )
      .max(10)
      .optional(),
    generatedByHenry: z.boolean().optional(),
  })
  .strict();

@Controller()
export class EmailTemplateController {
  constructor(private templates: EmailTemplateService) {}
  @Get('email-templates/catalog') @RequirePermissions('email_templates.read') catalog() {
    return this.templates.catalog();
  }
  @Get('email-templates/variables') @RequirePermissions('email_templates.read') variables() {
    return this.templates.variables();
  }
  @Get('email-templates/legal-content') @RequirePermissions('email_templates.read') legalContent(
    @Req() req: any,
  ) {
    return this.templates.legalRegistry(req.auth.user);
  }
  @Get('email-templates') @RequirePermissions('email_templates.read') list(
    @Req() req: any,
    @Query() query: any,
  ) {
    return this.templates.list(req.auth.user, query);
  }
  @Post('email-templates/recommendations') @RequirePermissions('email_templates.read') recommend(
    @Body(
      new ZodPipe(
        z
          .object({
            lifecycleStage: z.string().max(80).optional(),
            triggerEvent: z.string().max(120).optional(),
            evidence: z.array(z.string().max(120)).max(30).default([]),
            automation: z.boolean().default(false),
          })
          .strict(),
      ),
    )
    body: any,
    @Req() req: any,
  ) {
    return this.templates.recommend(req.auth.user, body);
  }
  @Get('email-templates/review-due')
  @RequirePermissions('email_templates.manage_corporate')
  reviewDue(@Req() req: any) {
    return this.templates.reviewDue(req.auth.user);
  }
  @Get('email-templates/:id') @RequirePermissions('email_templates.read') get(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.templates.get(uuid.parse(id), req.auth.user);
  }
  @Post('email-templates') @RequirePermissions('email_templates.read') create(
    @Body(new ZodPipe(createTemplate)) body: any,
    @Req() req: any,
  ) {
    return this.templates.create(body, req.auth.user, audit(req));
  }
  @Post('email-templates/:id/versions') @RequirePermissions('email_templates.read') version(
    @Param('id') id: string,
    @Body(new ZodPipe(createVersion)) body: any,
    @Req() req: any,
  ) {
    return this.templates.createVersion(uuid.parse(id), body, req.auth.user, audit(req));
  }
  @Post('email-template-versions/:id/legal-review')
  @RequirePermissions('email_templates.legal_approve')
  legalReview(
    @Param('id') id: string,
    @Body(
      new ZodPipe(
        z
          .object({
            reference: z.string().trim().min(8).max(500),
            nextReviewAt: z.string().datetime().optional(),
          })
          .strict(),
      ),
    )
    body: any,
    @Req() req: any,
  ) {
    return this.templates.recordLegalReview(uuid.parse(id), body, req.auth.user, audit(req));
  }
  @Post('email-templates/:id/approve') @RequirePermissions('email_templates.approve') approve(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.templates.approve(uuid.parse(id), req.auth.user, audit(req));
  }
  @Post('email-templates/:id/activate')
  @RequirePermissions('email_templates.manage_corporate')
  activate(@Param('id') id: string, @Req() req: any) {
    return this.templates.activate(uuid.parse(id), req.auth.user, audit(req));
  }
  @Post('email-templates/:id/variants')
  @RequirePermissions('email_templates.create_personal')
  variant(
    @Param('id') id: string,
    @Body(
      new ZodPipe(
        z
          .object({
            name: z.string().min(3).max(200),
            overrides: z.record(z.string().max(20000)).default({}),
          })
          .strict(),
      ),
    )
    body: any,
    @Req() req: any,
  ) {
    return this.templates.createVariant(uuid.parse(id), body, req.auth.user, audit(req));
  }
  @Get('email-drafts') @RequirePermissions('email_templates.preview') drafts(@Req() req: any) {
    return this.templates.listDrafts(req.auth.user);
  }
  @Post('email-drafts') @RequirePermissions('email_templates.preview') createDraft(
    @Body(new ZodPipe(draft)) body: any,
    @Req() req: any,
  ) {
    return this.templates.createDraft(body, req.auth.user, audit(req));
  }
  @Get('email-drafts/:id') @RequirePermissions('email_templates.preview') getDraft(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.templates.preview(uuid.parse(id), req.auth.user);
  }
  @Patch('email-drafts/:id') @RequirePermissions('email_templates.preview') updateDraft(
    @Param('id') id: string,
    @Body(
      new ZodPipe(
        draft.pick({
          subjectOverride: true,
          editableBlockOverrides: true,
          attachmentReferences: true,
        }),
      ),
    )
    body: any,
    @Req() req: any,
  ) {
    return this.templates.updateDraft(uuid.parse(id), body, req.auth.user);
  }
  @Post('email-drafts/:id/preview') @RequirePermissions('email_templates.preview') preview(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.templates.preview(uuid.parse(id), req.auth.user, audit(req));
  }
  @Post('email-drafts/:id/handoff') @RequirePermissions('email_templates.preview') handoff(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.templates.handoff(uuid.parse(id), req.auth.user, audit(req));
  }
  @Get('email-signatures') @RequirePermissions('email_templates.preview') signatures(
    @Req() req: any,
  ) {
    return this.templates.signature(req.auth.user);
  }
  @Post('email-signatures') @RequirePermissions('email_templates.preview') signature(
    @Body(
      new ZodPipe(
        z
          .object({
            title: z.string().max(120).optional(),
            phone: z
              .string()
              .regex(/^\+?[0-9 ()-]{7,30}$/)
              .optional(),
            approvedLinks: z.array(z.string().url().max(500)).max(5).optional(),
            isDefault: z.boolean().default(false),
          })
          .strict(),
      ),
    )
    body: any,
    @Req() req: any,
  ) {
    return this.templates.saveSignature(body, req.auth.user, audit(req));
  }
}
