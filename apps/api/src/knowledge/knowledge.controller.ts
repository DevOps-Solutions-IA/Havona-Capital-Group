import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { z } from 'zod';
import { RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeStagingService } from './knowledge-staging.service';

const actor = (req: any) => ({
  id: req.auth.user.id,
  roles: req.auth.user.roles,
  permissions: req.auth.user.permissions,
});
const formBoolean = z.preprocess(
  (value) => value === 'true' ? true : value === 'false' ? false : value,
  z.boolean(),
);
const upload = z.object({
  title: z.string().trim().min(3).max(240),
  description: z.string().max(1000).optional(),
  collectionId: z.string().uuid(),
  classification: z.enum([
    'GENERAL',
    'SALES',
    'MANAGERS',
    'ADMINISTRATION',
    'COMPLIANCE',
    'TRAINING',
    'TECHNOLOGY',
  ]),
  language: z.string().max(10).optional(),
  effectiveFrom: z.string().datetime({ offset: true }).optional(),
  effectiveUntil: z.string().datetime({ offset: true }).optional(),
  changeSummary: z.string().max(1000).optional(),
  versionLabel: z.string().max(120).optional(),
  sourceType: z.enum(['CONTRACTUAL', 'CAPACITACION', 'COMERCIAL', 'SIMULADOR', 'HISTORICO_VERSION', 'TRIBUTARIO_USUARIO', 'INFERENCIA_CONSULTIVA', 'CORPORATIVO']).optional(),
  authorityLevel: z.enum(['CUSTOMER_CONTRACTUAL', 'CONTRACTUAL_GENERAL', 'CUSTOMER_QUOTATION', 'OFFICIAL_TECHNICAL', 'TRAINING', 'COMMERCIAL', 'INTERPRETATION']).optional(),
  documentDate: z.string().date().optional(),
  currentStatus: z.enum(['CURRENT', 'HISTORICAL', 'UNKNOWN']).optional(),
  publicAllowed: formBoolean.optional(),
  consultantAllowed: formBoolean.optional(),
  managerAllowed: formBoolean.optional(),
  trainingAllowed: formBoolean.optional(),
  carrier: z.literal('PAN_AMERICAN_LIFE_COLOMBIA').optional(),
  authorizedProductId: z.string().uuid().optional(),
  authorizedSolutionId: z.string().uuid().optional(),
  productCode: z.string().max(100).optional(),
  sourceLocator: z.string().max(500).optional(),
  country: z.string().length(2).optional(),
  notes: z.string().max(1000).optional(),
  customerNeedKeys: z.array(z.enum(['FAMILY_PROTECTION', 'INCOME_PROTECTION', 'EDUCATION', 'RETIREMENT_PENSION_GAP', 'CAPITAL_ACCUMULATION', 'ACCIDENT_PROTECTION', 'CRITICAL_ILLNESS', 'CANCER_PROTECTION', 'BUSINESS_PARTNER_PROTECTION', 'KEY_PERSON', 'BUSINESS_CONTINUITY'])).max(11).optional(),
});
const search = z.object({
  query: z.string().trim().min(2).max(500),
  collectionId: z.string().uuid().optional(),
  historicalAt: z.string().datetime({ offset: true }).optional(),
  limit: z.number().int().min(1).max(12).optional(),
});
const stagingProposal = upload.pick({
  sourceType: true,
  authorityLevel: true,
  documentDate: true,
  currentStatus: true,
  publicAllowed: true,
  consultantAllowed: true,
  managerAllowed: true,
  trainingAllowed: true,
  carrier: true,
  authorizedProductId: true,
  authorizedSolutionId: true,
  versionLabel: true,
  country: true,
  notes: true,
  customerNeedKeys: true,
});

@Controller('knowledge')
export class KnowledgeController {
  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly staging: KnowledgeStagingService,
  ) {}
  @Get() @RequirePermissions('knowledge.read') list(@Query() query: any, @Req() req: any) {
    return this.knowledge.list(actor(req), query);
  }
  @Get('collections') @RequirePermissions('knowledge.read') collections(@Req() req: any) {
    return this.knowledge.collections(actor(req));
  }
  @Post('collections') @RequirePermissions('knowledge.admin') createCollection(
    @Body(
      new ZodPipe(
        z.object({
          key: z
            .string()
            .regex(/^[a-z0-9-]+$/)
            .max(80),
          name: z.string().min(2).max(160),
          description: z.string().max(600).optional(),
          allowedRoles: z.array(z.enum(['CONSULTOR', 'GERENTE', 'ADMIN', 'SUPER_ADMIN'])).max(4),
        }),
      ),
    )
    body: any,
    @Req() req: any,
  ) {
    return this.knowledge.createCollection(body, actor(req));
  }
  @Post('documents')
  @RequirePermissions('knowledge.upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: Number(process.env.KNOWLEDGE_MAX_FILE_SIZE ?? 15_000_000), files: 1 },
    }),
  )
  create(
    @Body(new ZodPipe(upload)) body: any,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    return this.knowledge.createDocument(body, file, actor(req), req);
  }
  @Get('documents/:id') @RequirePermissions('knowledge.read') get(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    return this.knowledge.getDocument(id, actor(req));
  }
  @Post('documents/:id/versions')
  @RequirePermissions('knowledge.upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: Number(process.env.KNOWLEDGE_MAX_FILE_SIZE ?? 15_000_000), files: 1 },
    }),
  )
  version(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(
      new ZodPipe(
        upload
          .omit({ title: true, description: true, collectionId: true, classification: true, language: true })
          .extend({ changeSummary: z.string().min(3).max(1000) }),
      ),
    )
    body: any,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    return this.knowledge.addVersion(id, body, file, actor(req));
  }
  @Post('documents/:id/approve') @RequirePermissions('knowledge.review') approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    return this.knowledge.approve(id, actor(req), req);
  }
  @Post('documents/:id/publish') @RequirePermissions('knowledge.publish') publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    return this.knowledge.publish(id, actor(req), req);
  }
  @Post('versions/:id/facts') @RequirePermissions('knowledge.review') addFact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(
      new ZodPipe(
        z.object({
          claimKey: z.string().regex(/^[a-z0-9._-]+$/).max(200),
          subject: z.string().min(2).max(200),
          predicate: z.string().min(2).max(160),
          value: z.unknown(),
          productVariant: z.string().max(120).optional(),
          plan: z.string().max(80).optional(),
          conditions: z.unknown().optional(),
          customerSpecific: z.boolean().optional(),
        }),
      ),
    )
    body: any,
    @Req() req: any,
  ) {
    return this.knowledge.addFact(id, body, actor(req));
  }
  @Patch('documents/:id/deprecate') @RequirePermissions('knowledge.publish') deprecate(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    return this.knowledge.deprecate(id, actor(req));
  }
  @Post('search') @RequirePermissions('knowledge.read') search(
    @Body(new ZodPipe(search)) body: any,
    @Req() req: any,
  ) {
    return this.knowledge.search(body.query, actor(req), body);
  }
  @Get('gaps') @RequirePermissions('knowledge.admin') gaps(@Req() req: any) {
    return this.knowledge.gaps(actor(req));
  }
  @Get('staging') @RequirePermissions('knowledge.review') stagingList(@Req() req: any) {
    return this.staging.list(actor(req));
  }
  @Post('staging')
  @RequirePermissions('knowledge.upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: Number(process.env.KNOWLEDGE_MAX_FILE_SIZE ?? 15_000_000), files: 1 },
  }))
  stage(
    @Body(new ZodPipe(stagingProposal)) body: any,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    return this.staging.stage(file, body, actor(req));
  }
  @Patch('staging/:id/review') @RequirePermissions('knowledge.review') reviewStaging(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(stagingProposal.extend({ approved: z.boolean() }))) body: any,
    @Req() req: any,
  ) {
    return this.staging.review(id, body, actor(req));
  }
  @Post('staging/:id/promote') @RequirePermissions('knowledge.upload') promoteStaging(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(z.object({
      title: z.string().min(3).max(240),
      description: z.string().max(1000).optional(),
      collectionId: z.string().uuid(),
      classification: upload.shape.classification,
    }))) body: any,
    @Req() req: any,
  ) {
    return this.staging.promote(id, body, actor(req));
  }
}
