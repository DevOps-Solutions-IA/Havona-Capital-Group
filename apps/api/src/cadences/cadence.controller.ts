import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { CadenceService } from './cadence.service';
import { createCadenceSchema, enrollCadenceSchema, cadenceVersionSchema } from './cadence.types';

const uuid = z.string().uuid();
const status = z
  .object({ status: z.enum(['REVIEW', 'APPROVED', 'ACTIVE', 'INACTIVE', 'ARCHIVED']) })
  .strict();
const enrollmentStatus = z
  .enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'STOPPED', 'FAILED', 'EXPIRED'])
  .optional();
const audit = (req: any) => ({
  actorUserId: req.auth.user.id,
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
});

@Controller('automations/cadences')
export class CadenceController {
  constructor(private cadences: CadenceService) {}
  @Get() @RequirePermissions('automations.read') list(
    @Req() req: any,
    @Query('status') state?: string,
  ) {
    return this.cadences.list(req.auth.user, state);
  }
  @Get('eligible') @RequirePermissions('automations.read') eligible(
    @Req() req: any,
    @Query('prospectId') prospectId: string,
    @Query('opportunityId') opportunityId?: string,
  ) {
    return this.cadences.eligible(
      req.auth.user,
      uuid.parse(prospectId),
      opportunityId ? uuid.parse(opportunityId) : undefined,
    );
  }
  @Get('enrollments') @RequirePermissions('automations.read') enrollments(
    @Req() req: any,
    @Query('status') state?: string,
  ) {
    return this.cadences.enrollments(req.auth.user, enrollmentStatus.parse(state));
  }
  @Get(':id') @RequirePermissions('automations.read') get(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.cadences.get(req.auth.user, uuid.parse(id));
  }
  @Post() @RequirePermissions('automations.admin') create(
    @Req() req: any,
    @Body(new ZodPipe(createCadenceSchema)) body: any,
  ) {
    return this.cadences.create(req.auth.user, body, audit(req));
  }
  @Post(':id/versions') @RequirePermissions('automations.admin') version(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodPipe(cadenceVersionSchema)) body: any,
  ) {
    return this.cadences.newVersion(req.auth.user, uuid.parse(id), body, audit(req));
  }
  @Patch(':id/status') @RequirePermissions('automations.activate') setStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodPipe(status)) body: any,
  ) {
    return this.cadences.status(req.auth.user, uuid.parse(id), body.status, audit(req));
  }
  @Post('enrollments/start') @RequirePermissions('automations.manage_own') enroll(
    @Req() req: any,
    @Body(new ZodPipe(enrollCadenceSchema)) body: any,
  ) {
    return this.cadences.enroll(req.auth.user, body, audit(req));
  }
  @Post('enrollments/:id/pause') @RequirePermissions('automations.manage_own') pause(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.cadences.pause(req.auth.user, uuid.parse(id), audit(req));
  }
  @Post('enrollments/:id/resume') @RequirePermissions('automations.manage_own') resume(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.cadences.resume(req.auth.user, uuid.parse(id), audit(req));
  }
  @Post('enrollments/:id/stop') @RequirePermissions('automations.manage_own') stop(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.cadences.stop(req.auth.user, uuid.parse(id), audit(req));
  }
}
