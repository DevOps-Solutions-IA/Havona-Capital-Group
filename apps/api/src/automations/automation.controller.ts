import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { AutomationService } from './automation.service';
import { createWorkflowSchema } from './automation.types';

const uuid = z.string().uuid();
const listSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(25),
    status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
  })
  .strict();
const statusSchema = z.object({ status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']) }).strict();
const decisionSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    note: z.string().trim().max(500).optional(),
  })
  .strict();
const suppressionSchema = z
  .object({
    entityType: z.string().min(2).max(60),
    entityId: uuid,
    reason: z.string().min(3).max(160),
  })
  .strict();
const eventSchema = z
  .object({
    eventId: z.string().min(8).max(160),
    type: z.string().min(3).max(120),
    entityType: z.string().min(2).max(60),
    entityId: uuid,
    payload: z.record(z.string(), z.unknown()).default({}),
    occurredAt: z.coerce.date().optional(),
  })
  .strict();
const audit = (req: any) => ({
  actorUserId: req.auth.user.id,
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
});

@Controller('automations')
export class AutomationController {
  constructor(private automations: AutomationService) {}
  @Get() @RequirePermissions('automations.read') list(
    @Query(new ZodPipe(listSchema)) query: any,
    @Req() req: any,
  ) {
    return this.automations.list(req.auth.user, query);
  }
  @Get(':id') @RequirePermissions('automations.read') get(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.automations.get(req.auth.user, uuid.parse(id));
  }
  @Post() @RequirePermissions('automations.create') create(
    @Body(new ZodPipe(createWorkflowSchema)) body: any,
    @Req() req: any,
  ) {
    return this.automations.create(req.auth.user, body, audit(req));
  }
  @Patch(':id/status') @RequirePermissions('automations.activate') status(
    @Param('id') id: string,
    @Body(new ZodPipe(statusSchema)) body: any,
    @Req() req: any,
  ) {
    return this.automations.setStatus(req.auth.user, uuid.parse(id), body.status, audit(req));
  }
  @Delete(':id') @RequirePermissions('automations.activate') archive(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.automations.archive(req.auth.user, uuid.parse(id), audit(req));
  }
  @Post('approvals/:id/resolve') @RequirePermissions('automations.approve') approval(
    @Param('id') id: string,
    @Body(new ZodPipe(decisionSchema)) body: any,
    @Req() req: any,
  ) {
    return this.automations.resolveApproval(
      req.auth.user,
      uuid.parse(id),
      body.decision,
      body.note,
      audit(req),
    );
  }
  @Post('executions/:id/cancel') @RequirePermissions('automations.manage_own') cancel(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.automations.cancel(req.auth.user, uuid.parse(id), audit(req));
  }
  @Post('suppressions') @RequirePermissions('automations.manage_own') suppress(
    @Body(new ZodPipe(suppressionSchema)) body: any,
    @Req() req: any,
  ) {
    return this.automations.pauseEntity(
      req.auth.user,
      body.entityType,
      body.entityId,
      body.reason,
      audit(req),
    );
  }
  @Post('events') @RequirePermissions('automations.admin') event(
    @Body(new ZodPipe(eventSchema)) body: any,
    @Req() req: any,
  ) {
    return this.automations.publishEvent({ ...body, actorUserId: req.auth.user.id } as any);
  }
}
