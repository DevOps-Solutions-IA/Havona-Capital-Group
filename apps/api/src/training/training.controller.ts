import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { TrainingService } from './training.service';

const program = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(1000).optional(),
  collectionId: z.string().uuid().optional(),
  modules: z
    .array(
      z.object({
        title: z.string().min(2).max(200),
        lessons: z
          .array(
            z.object({
              title: z.string().min(2).max(200),
              objective: z.string().min(3).max(1000),
              content: z.string().max(20_000).optional(),
              knowledgeDocumentId: z.string().uuid().optional(),
              estimatedMinutes: z.number().int().min(1).max(480).optional(),
            }),
          )
          .min(1)
          .max(30),
      }),
    )
    .min(1)
    .max(30),
});
@Controller('training')
export class TrainingController {
  constructor(private readonly training: TrainingService) {}
  @Get('programs') @RequirePermissions('training.read') list(@Req() req: any) {
    return this.training.listPrograms(
      req.auth.user.id,
      req.auth.user.permissions.includes('training.manage'),
    );
  }
  @Get('progress') @RequirePermissions('training.read') progressList(@Req() req: any) {
    return this.training.listProgress(req.auth.user.id);
  }
  @Get('programs/:id') @RequirePermissions('training.read') get(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    return this.training.getProgram(
      id,
      req.auth.user.id,
      req.auth.user.permissions.includes('training.manage'),
    );
  }
  @Post('programs') @RequirePermissions('training.manage') create(
    @Body(new ZodPipe(program)) body: any,
    @Req() req: any,
  ) {
    return this.training.createProgram(body, req.auth.user.id);
  }
  @Patch('programs/:id/publish') @RequirePermissions('training.manage') publish(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.training.publishProgram(id);
  }
  @Post('enrollments') @RequirePermissions('training.read') enroll(
    @Body(new ZodPipe(z.object({ programId: z.string().uuid(), userId: z.string().uuid() })))
    body: any,
    @Req() req: any,
  ) {
    return this.training.enroll(
      body.programId,
      body.userId,
      req.auth.user.id,
      req.auth.user.permissions.includes('training.read_team'),
    );
  }
  @Patch('programs/:id/progress') @RequirePermissions('training.read') progress(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(z.object({ lessonId: z.string().uuid() }))) body: any,
    @Req() req: any,
  ) {
    return this.training.progress(id, body.lessonId, req.auth.user.id);
  }
  @Post('assessments/:id/attempts') @RequirePermissions('training.read') attempt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(z.object({ answers: z.record(z.string().uuid(), z.unknown()) }))) body: any,
    @Req() req: any,
  ) {
    return this.training.attempt(id, body.answers, req.auth.user.id);
  }
  @Post('roleplays') @RequirePermissions('training.read') roleplay(
    @Body(
      new ZodPipe(
        z.object({
          scenarioKey: z.enum([
            'objection_price',
            'think_about_it',
            'already_insured',
            'no_budget',
          ]),
        }),
      ),
    )
    body: any,
    @Req() req: any,
  ) {
    return this.training.startRoleplay(body.scenarioKey, req.auth.user.id);
  }
  @Post('roleplays/:id/evaluate') @RequirePermissions('training.read') evaluate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(
      new ZodPipe(
        z.object({
          transcript: z
            .array(
              z.object({
                role: z.enum(['CONSULTANT', 'CLIENT']),
                content: z.string().min(1).max(4000),
              }),
            )
            .min(2)
            .max(100),
        }),
      ),
    )
    body: any,
    @Req() req: any,
  ) {
    return this.training.evaluateRoleplay(id, body.transcript, req.auth.user.id);
  }
}
