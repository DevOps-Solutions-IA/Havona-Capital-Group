import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { HenryMemoryService } from './memory.service';

@Controller('henry/memory')
export class HenryMemoryController {
  constructor(private readonly memory: HenryMemoryService) {}
  @Get() @RequirePermissions('memory.manage_own') list(@Req() req: any) {
    return this.memory.list(req.auth.user.id);
  }
  @Post() @RequirePermissions('memory.manage_own') save(
    @Body(
      new ZodPipe(
        z.object({
          key: z.string().min(2).max(120),
          value: z.union([
            z.string().max(1000),
            z.array(z.string().max(160)).max(20),
            z.record(z.string(), z.unknown()),
          ]),
          confirmed: z.boolean().optional(),
          retentionDays: z.number().int().min(1).max(730).optional(),
        }),
      ),
    )
    body: any,
    @Req() req: any,
  ) {
    return this.memory.save(req.auth.user.id, body, req);
  }
  @Delete(':id') @RequirePermissions('memory.manage_own') forget(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    return this.memory.forget(req.auth.user.id, id, req);
  }
}
