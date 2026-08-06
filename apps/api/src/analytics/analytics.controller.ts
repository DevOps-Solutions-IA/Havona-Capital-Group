import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query, Req, StreamableFile } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { AnalyticsService } from './analytics.service';

const querySchema = z.object({
  preset: z.enum(['today', 'yesterday', 'week', 'month', 'quarter', 'year', 'custom']).optional(),
  start: z.string().datetime({ offset: true }).optional(),
  end: z.string().datetime({ offset: true }).optional(),
  timezone: z.string().min(1).max(80).optional(),
  consultantId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
}).refine((value) => value.preset !== 'custom' || (value.start && value.end), 'Rango personalizado incompleto');
const goalSchema = z.object({ metricKey: z.string().min(3).max(120), targetValue: z.union([z.string().regex(/^\d{1,20}(?:\.\d{1,4})?$/), z.number().positive()]), currency: z.enum(['COP', 'USD']).optional(), scopeType: z.enum(['ORGANIZATION', 'TEAM', 'USER']), scopeUserId: z.string().uuid().optional(), periodStart: z.string().datetime({ offset: true }), periodEnd: z.string().datetime({ offset: true }), timezone: z.string().min(1).max(80).optional() }).refine((value) => new Date(value.periodStart) < new Date(value.periodEnd), 'Periodo de meta inválido');
const goalUpdateSchema = z.object({ targetValue: z.union([z.string().regex(/^\d{1,20}(?:\.\d{1,4})?$/), z.number().positive()]).optional(), status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']).optional() }).refine((value) => Object.keys(value).length > 0, 'Sin cambios');
const actor = (req: any) => ({ id: req.auth.user.id, roles: req.auth.user.roles, permissions: req.auth.user.permissions });

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}
  @Get('catalog') @RequirePermissions('analytics.read') catalog() { return this.analytics.catalog(); }
  @Get('summary') @RequirePermissions('analytics.read') summary(@Query(new ZodPipe(querySchema)) query: any, @Req() req: any) { return this.analytics.summary(query, actor(req)); }
  @Get('metrics/:key') @RequirePermissions('analytics.read') metric(@Param('key') key: string, @Query(new ZodPipe(querySchema)) query: any, @Req() req: any) { return this.analytics.compareMetric(key, query, actor(req)); }
  @Get('funnel') @RequirePermissions('analytics.read') funnel(@Query(new ZodPipe(querySchema)) query: any, @Req() req: any) { return this.analytics.funnel(query, actor(req)); }
  @Get('cohorts') @RequirePermissions('analytics.read') cohorts(@Query(new ZodPipe(querySchema)) query: any, @Req() req: any) { return this.analytics.cohorts(query, actor(req)); }
  @Get('pipeline') @RequirePermissions('analytics.read') pipeline(@Query(new ZodPipe(querySchema)) query: any, @Req() req: any) { return this.analytics.pipeline(query, actor(req)); }
  @Get('risks') @RequirePermissions('analytics.read') risks(@Query(new ZodPipe(querySchema)) query: any, @Req() req: any) { return this.analytics.pipeline(query, actor(req)); }
  @Get('priorities') @RequirePermissions('analytics.read') priorities(@Query(new ZodPipe(querySchema)) query: any, @Req() req: any) { return this.analytics.priorities(query, actor(req)); }
  @Get('team') @RequirePermissions('analytics.read_team') team(@Query(new ZodPipe(querySchema)) query: any, @Req() req: any) { return this.analytics.team(query, actor(req)); }
  @Get('consultants/:id') @RequirePermissions('analytics.read') consultant(@Param('id', ParseUUIDPipe) id: string, @Query(new ZodPipe(querySchema)) query: any, @Req() req: any) { return this.analytics.summary({ ...query, consultantId: id }, actor(req)); }
  @Get('goals') @RequirePermissions('analytics.read') goals(@Query(new ZodPipe(querySchema)) query: any, @Req() req: any) { return this.analytics.goals(query, actor(req)); }
  @Post('goals') @RequirePermissions('analytics.goals.manage') createGoal(@Body(new ZodPipe(goalSchema)) body: any, @Req() req: any) { return this.analytics.createGoal(body, actor(req), req); }
  @Patch('goals/:id') @RequirePermissions('analytics.goals.manage') updateGoal(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(goalUpdateSchema)) body: any, @Req() req: any) { return this.analytics.updateGoal(id, body, actor(req), req); }
  @Get('data-quality') @RequirePermissions('analytics.read') quality(@Query(new ZodPipe(querySchema)) query: any, @Req() req: any) { return this.analytics.dataQuality(query, actor(req)); }
  @Get('anomalies') @RequirePermissions('analytics.read') anomalies(@Query(new ZodPipe(querySchema)) query: any, @Req() req: any) { return this.analytics.anomalies(query, actor(req)); }
  @Get('communications') @RequirePermissions('analytics.read') communications(@Query(new ZodPipe(querySchema)) query: any, @Req() req: any) { return this.analytics.communications(query, actor(req)); }
  @Get('automations') @RequirePermissions('analytics.read') automations(@Query(new ZodPipe(querySchema)) query: any, @Req() req: any) { return this.analytics.automations(query, actor(req)); }
  @Get('henry') @RequirePermissions('analytics.read') henry(@Query(new ZodPipe(querySchema)) query: any, @Req() req: any) { return this.analytics.henry(query, actor(req)); }
  @Get('exports/priorities.csv') @RequirePermissions('analytics.export') @Header('Content-Type', 'text/csv; charset=utf-8') @Header('Content-Disposition', 'attachment; filename="havona-prioridades.csv"') async exportPriorities(@Query(new ZodPipe(querySchema)) query: any, @Req() req: any) { const rows = await this.analytics.priorities(query, actor(req)); const safe = (value: unknown) => { const text = String(value ?? '').replaceAll('"', '""'); return `"${/^[=+\-@]/.test(text) ? `'${text}` : text}"`; }; const csv = ['tipo,severidad,entidad,id,titulo,razon', ...rows.slice(0, 5000).map((row: any) => [row.type, row.severity, row.entityType, row.entityId, row.title, row.reason].map(safe).join(','))].join('\n'); return new StreamableFile(Buffer.from(`\uFEFF${csv}`)); }
}
