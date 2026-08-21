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
  cancelMeetingSchema,
  createMeetingSchema,
  meetingInvitationSchema,
  meetingListQuerySchema,
  meetingProviderEventSchema,
  publicMeetingJoinSchema,
  updateMeetingSchema,
} from '@havona/contracts';
import { Public, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { MeetingService } from './meeting.service';
const audit = (req: any) => ({
  actorUserId: req.auth?.user?.id,
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
});
@Controller()
export class MeetingController {
  constructor(private readonly meetings: MeetingService) {}
  @Get('meetings') @RequirePermissions('meeting.read') list(
    @Query(new ZodPipe(meetingListQuerySchema)) q: any,
    @Req() req: any,
  ) {
    return this.meetings.list(req.auth.user, q);
  }
  @Get('meetings/team') @RequirePermissions('meeting.manage_team') team(
    @Query(new ZodPipe(meetingListQuerySchema)) q: any,
    @Req() req: any,
  ) {
    return this.meetings.team(req.auth.user, q);
  }
  @Get('meetings/:id') @RequirePermissions('meeting.read') get(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    return this.meetings.get(req.auth.user, id);
  }
  @Post('meetings') @RequirePermissions('meeting.create') create(
    @Body(new ZodPipe(createMeetingSchema)) body: any,
    @Headers('idempotency-key') key: string,
    @Req() req: any,
  ) {
    return this.meetings.create(req.auth.user, body, key, audit(req));
  }
  @Patch('meetings/:id') @RequirePermissions('meeting.manage_own') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateMeetingSchema)) body: any,
    @Req() req: any,
  ) {
    return this.meetings.update(req.auth.user, id, body, audit(req));
  }
  @Delete('meetings/:id') @RequirePermissions('meeting.manage_own') cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(cancelMeetingSchema)) body: any,
    @Req() req: any,
  ) {
    return this.meetings.cancel(req.auth.user, id, body.reason, audit(req));
  }
  @Post('meetings/:id/join') @RequirePermissions('meeting.join') join(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    return this.meetings.join(req.auth.user, id, audit(req));
  }
  @Post('meetings/:id/invitations') @RequirePermissions('meeting.manage_own') invite(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(meetingInvitationSchema)) body: any,
    @Req() req: any,
  ) {
    return this.meetings.invite(req.auth.user, id, body, audit(req));
  }
  @Delete('meetings/:id/invitations/:invitationId')
  @RequirePermissions('meeting.manage_own')
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
    @Req() req: any,
  ) {
    return this.meetings.revokeInvite(req.auth.user, id, invitationId, audit(req));
  }
  @Public() @Throttle({ default: { limit: 20, ttl: 60000 } }) @Post('public/meetings/join') guest(
    @Body(new ZodPipe(publicMeetingJoinSchema)) body: any,
    @Req() req: any,
  ) {
    return this.meetings.guestJoin(body.token, body.displayName, audit(req));
  }
  @Public()
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Post('integrations/jitsi/events')
  event(
    @Headers('x-havona-jitsi-secret') secret: string,
    @Body(new ZodPipe(meetingProviderEventSchema)) body: any,
  ) {
    return this.meetings.providerEvent(secret ?? '', body);
  }
}
