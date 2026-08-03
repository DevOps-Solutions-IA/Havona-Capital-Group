import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { calendarAvailabilityQuerySchema, calendarAvailabilityRuleSchema, calendarEventListQuerySchema, cancelCalendarEventSchema, createCalendarEventSchema, selectCalendarSchema, updateCalendarEventSchema } from '@havona/contracts';
import { Public, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { CalendarService } from './calendar.service';

const audit = (req: any) => ({ actorUserId: req.auth?.user?.id, ipAddress: req.ip, userAgent: req.headers['user-agent'] });

@Controller()
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get('integrations/google/calendar/oauth/connect')
  @RequirePermissions('calendar.connect')
  begin(@Req() req: any) { return this.calendar.beginOAuth(req.auth.user); }

  @Public()
  @Get('integrations/google/calendar/oauth/callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Query('error') error: string | undefined, @Req() req: any, @Res() res: Response) {
    if (error || !code || !state) return res.redirect(`${process.env.APP_ORIGIN ?? 'http://localhost:3000'}/agenda?calendar=denied`);
    await this.calendar.completeOAuth(code, state, audit(req));
    return res.redirect(`${process.env.APP_ORIGIN ?? 'http://localhost:3000'}/agenda?calendar=connected`);
  }

  @Get('calendar/status') @RequirePermissions('calendar.read') status(@Req() req: any) { return this.calendar.status(req.auth.user); }
  @Get('calendar/calendars') @RequirePermissions('calendar.connect') calendars(@Req() req: any) { return this.calendar.calendars(req.auth.user); }
  @Put('calendar/calendar') @RequirePermissions('calendar.connect') select(@Body(new ZodPipe(selectCalendarSchema)) body: any, @Req() req: any) { return this.calendar.selectCalendar(req.auth.user, body.calendarId, audit(req)); }
  @Delete('calendar/connection') @RequirePermissions('calendar.connect') disconnect(@Req() req: any) { return this.calendar.disconnect(req.auth.user, audit(req)); }
  @Get('calendar/rules') @RequirePermissions('calendar.read') rules(@Req() req: any) { return this.calendar.getRules(req.auth.user); }
  @Put('calendar/rules') @RequirePermissions('calendar.manage_own') updateRules(@Body(new ZodPipe(calendarAvailabilityRuleSchema)) body: any, @Req() req: any) { return this.calendar.updateRules(req.auth.user, body, audit(req)); }
  @Get('calendar/availability') @RequirePermissions('calendar.read') availability(@Query(new ZodPipe(calendarAvailabilityQuerySchema)) query: any, @Req() req: any) { return this.calendar.availability(req.auth.user, query); }
  @Get('calendar/events') @RequirePermissions('calendar.read') events(@Query(new ZodPipe(calendarEventListQuerySchema)) query: any, @Req() req: any) { return this.calendar.listEvents(req.auth.user, query); }
  @Post('calendar/events') @RequirePermissions('calendar.manage_own') create(@Body(new ZodPipe(createCalendarEventSchema)) body: any, @Headers('idempotency-key') key: string, @Req() req: any) { return this.calendar.createEvent(req.auth.user, body, key, audit(req)); }
  @Patch('calendar/events/:id') @RequirePermissions('calendar.manage_own') update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateCalendarEventSchema)) body: any, @Headers('idempotency-key') key: string, @Req() req: any) { return this.calendar.updateEvent(req.auth.user, id, body, key, audit(req)); }
  @Delete('calendar/events/:id') @RequirePermissions('calendar.manage_own') cancel(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(cancelCalendarEventSchema)) body: any, @Headers('idempotency-key') key: string, @Req() req: any) { return this.calendar.cancelEvent(req.auth.user, id, body, key, audit(req)); }
  @Post('calendar/sync') @RequirePermissions('calendar.manage_own') sync(@Req() req: any) { return this.calendar.sync(req.auth.user); }
  @Post('calendar/watch') @RequirePermissions('calendar.manage_own') watch(@Req() req: any) { return this.calendar.startWatch(req.auth.user); }
  @Delete('calendar/watch') @RequirePermissions('calendar.manage_own') stopWatch(@Req() req: any) { return this.calendar.stopWatch(req.auth.user); }

  @Public()
  @Post('integrations/google/calendar/webhook')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  webhook(@Headers() headers: Record<string, string | string[] | undefined>) { return this.calendar.webhook(headers); }
}
