import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  createHenryConversationSchema,
  henryConversationListSchema,
  requestEscalationSchema,
  sendHenryMessageSchema,
} from '@havona/contracts';
import { Public, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { HenryService } from './henry.service';
import { HenryMessagingOperatorService } from './henry-messaging-operator.service';
import { z } from 'zod';

const context = (request: any) => ({
  actorUserId: request.auth?.user?.id,
  ipAddress: request.ip,
  userAgent: request.headers['user-agent'],
});

@Controller('henry')
export class HenryController {
  constructor(
    private readonly henry: HenryService,
    private readonly messaging: HenryMessagingOperatorService,
  ) {}

  @Post('conversations')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(@Body(new ZodPipe(createHenryConversationSchema)) body: any, @Req() request: any) {
    return this.henry.create(body, context(request));
  }

  @Post('internal/conversations')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createInternal(@Body(new ZodPipe(createHenryConversationSchema)) body: any, @Req() request: any) {
    return this.henry.create(body, context(request), request.auth.user);
  }

  @Get('internal/conversations/:id')
  getInternal(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-henry-token') token: string | undefined,
    @Req() request: any,
  ) {
    return this.henry.get(id, token, request.auth.user);
  }

  @Post('internal/conversations/:id/messages')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  sendInternal(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-henry-token') token: string | undefined,
    @Body(new ZodPipe(sendHenryMessageSchema)) body: any,
    @Req() request: any,
  ) {
    return this.henry.send(id, token, body, context(request), request.auth.user);
  }

  @Get('conversations/:id')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  get(@Param('id', ParseUUIDPipe) id: string, @Headers('x-henry-token') token: string | undefined) {
    return this.henry.get(id, token);
  }

  @Post('conversations/:id/messages')
  @Public()
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  send(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-henry-token') token: string | undefined,
    @Body(new ZodPipe(sendHenryMessageSchema)) body: any,
    @Req() request: any,
  ) {
    return this.henry.send(id, token, body, context(request));
  }

  @Post('conversations/:id/escalations')
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  escalate(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-henry-token') token: string | undefined,
    @Body(new ZodPipe(requestEscalationSchema)) body: any,
    @Req() request: any,
  ) {
    return this.henry.requestEscalation(id, token, body.reason, body.summary, context(request));
  }

  @Get('admin/conversations')
  @RequirePermissions('henry.read_assigned')
  list(@Query(new ZodPipe(henryConversationListSchema)) query: any, @Req() request: any) {
    return this.henry.list(query, request.auth.user);
  }

  @Get('admin/conversations/:id')
  @RequirePermissions('henry.read_assigned')
  detail(@Param('id', ParseUUIDPipe) id: string, @Req() request: any) {
    return this.henry.detail(id, request.auth.user, context(request));
  }

  @Get('admin/dashboard')
  @RequirePermissions('henry.dashboard')
  dashboard(@Req() request: any) {
    return this.henry.dashboard(request.auth.user);
  }

  @Post('internal/conversations/:id/email-drafts')
  @RequirePermissions('communications.send', 'email_templates.preview')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  async prepareEmail(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(
      new ZodPipe(
        z
          .object({
            prospectId: z.string().uuid().optional(),
            recipientName: z.string().min(2).max(120).optional(),
            threadId: z.string().uuid().optional(),
            templateId: z.string().uuid().optional(),
            lifecycleStage: z.string().max(80).optional(),
            triggerEvent: z.string().max(120).optional(),
            evidence: z.array(z.string().max(120)).max(20).optional(),
            subject: z.string().min(1).max(300).optional(),
            body: z.string().min(1).max(20000).optional(),
            messageClassification: z.enum(['TRANSACTIONAL', 'RELATIONSHIP', 'SERVICE']).optional(),
            calendarEventId: z.string().uuid().optional(),
            meetingId: z.string().uuid().optional(),
            opportunityId: z.string().uuid().optional(),
          })
          .strict(),
      ),
    )
    body: any,
    @Req() request: any,
  ) {
    return this.messaging.prepare(
      request.auth.user,
      await this.messaging.resolveConversationReference(id),
      body,
      context(request),
    );
  }

  @Patch('internal/conversations/:id/email-drafts/:draftId')
  @RequirePermissions('communications.send', 'email_templates.preview')
  async updateEmail(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('draftId', ParseUUIDPipe) draftId: string,
    @Body(
      new ZodPipe(
        z
          .object({
            subjectOverride: z.string().max(300).optional(),
            editableBlockOverrides: z.record(z.string().max(20000)).optional(),
          })
          .strict(),
      ),
    )
    body: any,
    @Req() request: any,
  ) {
    return this.messaging.update(
      request.auth.user,
      await this.messaging.resolveConversationReference(id),
      { ...body, draftId },
      context(request),
    );
  }

  @Post('internal/conversations/:id/email-confirmations')
  @RequirePermissions('communications.send', 'email_templates.preview')
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  async requestEmailConfirmation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(
      new ZodPipe(
        z
          .object({
            draftId: z.string().uuid().optional(),
            intent: z.enum(['EMAIL_SEND', 'EMAIL_SCHEDULE']).default('EMAIL_SEND'),
            scheduledAt: z.string().datetime({ offset: true }).optional(),
            timezone: z.string().max(80).optional(),
            plan: z.record(z.unknown()).optional(),
          })
          .strict(),
      ),
    )
    body: any,
    @Req() request: any,
  ) {
    return this.messaging.requestConfirmation(
      request.auth.user,
      await this.messaging.resolveConversationReference(id),
      body,
      context(request),
    );
  }

  @Post('internal/messaging-operations/:operationId/confirm')
  @RequirePermissions('communications.send')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  confirmEmail(@Param('operationId', ParseUUIDPipe) operationId: string, @Req() request: any) {
    return this.messaging.confirm(request.auth.user, operationId, context(request));
  }

  @Delete('internal/messaging-operations/:operationId/schedule')
  @RequirePermissions('communications.send')
  cancelScheduledEmail(
    @Param('operationId', ParseUUIDPipe) operationId: string,
    @Req() request: any,
  ) {
    return this.messaging.cancel(request.auth.user, operationId, context(request));
  }

  @Get('internal/messaging-operations/:operationId')
  @RequirePermissions('communications.send')
  emailStatus(@Param('operationId', ParseUUIDPipe) operationId: string, @Req() request: any) {
    return this.messaging.status(request.auth.user, operationId);
  }

  @Get('internal/conversations/:id/messaging-operation')
  @RequirePermissions('communications.send', 'email_templates.preview')
  async currentEmail(@Param('id', ParseUUIDPipe) id: string, @Req() request: any) {
    return this.messaging.current(
      request.auth.user,
      await this.messaging.resolveConversationReference(id),
    );
  }
}
