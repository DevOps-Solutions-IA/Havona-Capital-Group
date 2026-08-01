import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { captureProspectSchema, prospectListQuerySchema } from '@havona/contracts';
import { Public, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { ProspectsService } from './prospects.service';

const requestContext = (request: any) => ({ ipAddress: request.ip, userAgent: request.headers['user-agent'] });

@Controller('prospects')
export class ProspectsController {
  constructor(private readonly prospects: ProspectsService) {}

  @Post('public')
  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  async capture(@Body(new ZodPipe(captureProspectSchema)) body: any, @Req() request: any) {
    const prospect = await this.prospects.capture(body, requestContext(request));
    return { data: prospect, message: 'Recibimos su información correctamente.' };
  }

  @Get()
  @RequirePermissions('prospects.read')
  list(@Query(new ZodPipe(prospectListQuerySchema)) query: any) {
    return this.prospects.list(query);
  }

  @Get(':id')
  @RequirePermissions('prospects.read')
  get(@Param('id', ParseUUIDPipe) id: string, @Req() request: any) {
    return this.prospects.get(id, { actorUserId: request.auth.user.id, ...requestContext(request) });
  }
}
