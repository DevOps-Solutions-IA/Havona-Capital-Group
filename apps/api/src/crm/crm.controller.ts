import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  assignProspectSchema,
  createInteractionSchema,
  createNoteSchema,
  createOpportunitySchema,
  createTagSchema,
  createTaskSchema,
  createCompanySchema,
  crmActivityQuerySchema,
  crmListQuerySchema,
  crmProspectListQuerySchema,
  moveOpportunityStageSchema,
  opportunityListQuerySchema,
  prospectTagSchema,
  taskListQuerySchema,
  updateNoteSchema,
  updateCrmProspectSchema,
  updateTaskStatusSchema,
} from '@havona/contracts';
import { RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { CrmService } from './crm.service';
const actor = (request: any) => ({
  id: request.auth.user.id,
  permissions: request.auth.user.permissions,
});
@Controller('crm')
export class CrmController {
  constructor(private readonly crm: CrmService) {}
  @Get('prospects') @RequirePermissions('crm.read_assigned') prospects(
    @Query(new ZodPipe(crmProspectListQuerySchema)) query: any,
    @Req() req: any,
  ) {
    return this.crm.prospects(query, actor(req));
  }
  @Get('prospects/:id') @RequirePermissions('crm.read_assigned') prospect(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    return this.crm.prospect360(id, actor(req), req);
  }
  @Patch('prospects/:id') @RequirePermissions('crm.update') updateProspect(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateCrmProspectSchema)) body: any,
    @Req() req: any,
  ) {
    return this.crm.updateProspect(id, body, actor(req), req);
  }
  @Get('prospects/:id/assignments') @RequirePermissions('crm.read_assigned') assignments(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    return this.crm.assignments(id, actor(req));
  }
  @Put('prospects/:id/assignment') @RequirePermissions('crm.assign') assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(assignProspectSchema)) body: any,
    @Req() req: any,
  ) {
    return this.crm.assign(id, body.assigneeId, actor(req), req);
  }
  @Get('stages') @RequirePermissions('crm.read_assigned') stages() {
    return this.crm.stages();
  }
  @Get('opportunities') @RequirePermissions('crm.read_assigned') opportunities(
    @Query(new ZodPipe(opportunityListQuerySchema)) query: any,
    @Req() req: any,
  ) {
    return this.crm.opportunities(query, actor(req));
  }
  @Get('opportunities/:id') @RequirePermissions('crm.read_assigned') opportunity(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    return this.crm.opportunityDetail(id, actor(req));
  }
  @Post('opportunities') @RequirePermissions('crm.opportunities') createOpportunity(
    @Body(new ZodPipe(createOpportunitySchema)) body: any,
    @Req() req: any,
  ) {
    return this.crm.createOpportunity(body, actor(req), req);
  }
  @Put('opportunities/:id/stage') @RequirePermissions('crm.opportunities') move(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(moveOpportunityStageSchema)) body: any,
    @Req() req: any,
  ) {
    return this.crm.moveOpportunity(id, body, actor(req), req);
  }
  @Get('tasks') @RequirePermissions('crm.tasks.own') tasks(
    @Query(new ZodPipe(taskListQuerySchema)) query: any,
    @Req() req: any,
  ) {
    return this.crm.tasks(query, actor(req));
  }
  @Post('tasks') @RequirePermissions('crm.tasks.own') createTask(
    @Body(new ZodPipe(createTaskSchema)) body: any,
    @Req() req: any,
  ) {
    return this.crm.createTask(body, actor(req), req);
  }
  @Patch('tasks/:id/status') @RequirePermissions('crm.tasks.own') taskStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateTaskStatusSchema)) body: any,
    @Req() req: any,
  ) {
    return this.crm.taskStatus(id, body.status, actor(req), req);
  }
  @Post('notes') @RequirePermissions('crm.notes') note(
    @Body(new ZodPipe(createNoteSchema)) body: any,
    @Req() req: any,
  ) {
    return this.crm.createNote(body, actor(req), req);
  }
  @Patch('notes/:id') @RequirePermissions('crm.notes') updateNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateNoteSchema)) body: any,
    @Req() req: any,
  ) {
    return this.crm.updateNote(id, body.body, actor(req), req);
  }
  @Post('interactions') @RequirePermissions('crm.notes') interaction(
    @Body(new ZodPipe(createInteractionSchema)) body: any,
    @Req() req: any,
  ) {
    return this.crm.interaction(body, actor(req), req);
  }
  @Get('tags') @RequirePermissions('crm.read_assigned') tags() {
    return this.crm.tags();
  }
  @Post('tags') @RequirePermissions('crm.assign') createTag(
    @Body(new ZodPipe(createTagSchema)) body: any,
    @Req() req: any,
  ) {
    return this.crm.createTag(body, req);
  }
  @Put('prospects/:id/tags') @RequirePermissions('crm.update') tag(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(prospectTagSchema)) body: any,
    @Req() req: any,
  ) {
    return this.crm.tagProspect(id, body.tagId, actor(req), req);
  }
  @Delete('prospects/:id/tags/:tagId') @RequirePermissions('crm.update') untag(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
    @Req() req: any,
  ) {
    return this.crm.untagProspect(id, tagId, actor(req), req);
  }
  @Get('activities') @RequirePermissions('crm.read_assigned') activities(
    @Query(new ZodPipe(crmActivityQuerySchema)) query: any,
    @Req() req: any,
  ) {
    return this.crm.activities(query, actor(req));
  }
  @Get('clients') @RequirePermissions('crm.read_assigned') clients(
    @Query(new ZodPipe(crmListQuerySchema)) query: any,
    @Req() req: any,
  ) {
    return this.crm.clients(query, actor(req));
  }
  @Get('companies') @RequirePermissions('crm.read_all') companies(
    @Query(new ZodPipe(crmListQuerySchema)) query: any,
    @Req() req: any,
  ) {
    return this.crm.companies(query, actor(req));
  }
  @Post('companies') @RequirePermissions('crm.update') createCompany(
    @Body(new ZodPipe(createCompanySchema)) body: any,
    @Req() req: any,
  ) {
    return this.crm.createCompany(body, actor(req), req);
  }
  @Get('consultants') @RequirePermissions('crm.assign') consultants() {
    return this.crm.consultants();
  }
  @Get('dashboard') @RequirePermissions('crm.dashboard') dashboard(@Req() req: any) {
    return this.crm.dashboard(actor(req));
  }
}
