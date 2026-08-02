import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createHenryConversationSchema, henryConversationListSchema, requestEscalationSchema, sendHenryMessageSchema } from '@havona/contracts';
import { Public, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { HenryService } from './henry.service';

const context = (request: any) => ({ actorUserId: request.auth?.user?.id, ipAddress: request.ip, userAgent: request.headers['user-agent'] });

@Controller('henry')
export class HenryController {
  constructor(private readonly henry: HenryService) {}

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
  getInternal(@Param('id', ParseUUIDPipe) id: string, @Headers('x-henry-token') token: string | undefined, @Req() request: any) {
    return this.henry.get(id, token, request.auth.user);
  }

  @Post('internal/conversations/:id/messages')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  sendInternal(@Param('id', ParseUUIDPipe) id: string, @Headers('x-henry-token') token: string | undefined, @Body(new ZodPipe(sendHenryMessageSchema)) body: any, @Req() request: any) {
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
  send(@Param('id', ParseUUIDPipe) id: string, @Headers('x-henry-token') token: string | undefined, @Body(new ZodPipe(sendHenryMessageSchema)) body: any, @Req() request: any) {
    return this.henry.send(id, token, body, context(request));
  }

  @Post('conversations/:id/escalations')
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  escalate(@Param('id', ParseUUIDPipe) id: string, @Headers('x-henry-token') token: string | undefined, @Body(new ZodPipe(requestEscalationSchema)) body: any, @Req() request: any) {
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
}
