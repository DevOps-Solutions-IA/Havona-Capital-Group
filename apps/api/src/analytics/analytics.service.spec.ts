import { ForbiddenException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { Prisma } from '@havona/database';

const db: any = {
  calendarTeamMembership: { findMany: jest.fn() },
  pipelineStage: { findMany: jest.fn() },
  opportunityStageHistory: { findMany: jest.fn() },
  opportunity: { count: jest.fn(), findMany: jest.fn() },
  prospect: { count: jest.fn() }, assignment: { count: jest.fn() }, interaction: { count: jest.fn() }, task: { count: jest.fn(), findMany: jest.fn() }, calendarEventLink: { count: jest.fn() }, communicationMessage: { count: jest.fn() }, communicationThread: { count: jest.fn() }, automationExecution: { count: jest.fn() }, automationApproval: { count: jest.fn() }, conversation: { count: jest.fn() }, escalation: { count: jest.fn() }, aIExecution: { count: jest.fn() }, aIUsage: { aggregate: jest.fn() }, analyticsGoal: { findMany: jest.fn() }, user: { findMany: jest.fn() },
};
const service = new AnalyticsService(db, { record: jest.fn() } as any);
const own = { id: 'own', roles: ['CONSULTOR'], permissions: ['analytics.read'] };

describe('AnalyticsService', () => {
  beforeEach(() => jest.clearAllMocks());
  it('impide inferir métricas de otro consultor', async () => {
    await expect(service.scope(own, 'other')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('limita gerente al equipo explícito', async () => {
    db.calendarTeamMembership.findMany.mockResolvedValue([{ memberId: 'member' }]);
    const manager = { id: 'manager', permissions: ['analytics.read', 'analytics.read_team'] };
    await expect(service.scope(manager, 'member')).resolves.toEqual({ kind: 'TEAM', userIds: ['member'] });
    await expect(service.scope(manager, 'outside')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('no convierte pipeline monetario desconocido en cero', async () => {
    db.opportunity.findMany.mockResolvedValue([]);
    const result = await service.metric('sales.pipeline_value', { preset: 'month' }, own);
    expect(result).toEqual(expect.objectContaining({ value: null, money: [], availability: 'notAvailable' }));
  });
  it('separa monedas y conserva precisión decimal en pipeline', async () => {
    db.opportunity.findMany.mockResolvedValue([
      { amount: new Prisma.Decimal('250000000.25'), currency: 'COP', probability: new Prisma.Decimal(50) },
      { amount: new Prisma.Decimal('100.00'), currency: 'USD', probability: new Prisma.Decimal(25) },
    ]);
    const raw = await service.metric('sales.pipeline_value', { preset: 'month' }, own);
    const weighted = await service.metric('sales.weighted_pipeline', { preset: 'month' }, own);
    expect(raw.money).toEqual([{ currency: 'COP', amount: '250000000.25' }, { currency: 'USD', amount: '100.00' }]);
    expect(weighted.money).toEqual([{ currency: 'COP', amount: '125000000.13' }, { currency: 'USD', amount: '25.00' }]);
  });
  it('reduce cobertura ponderada cuando falta probabilidad sin usar cero', async () => {
    db.opportunity.findMany.mockResolvedValue([
      { amount: new Prisma.Decimal('100.00'), currency: 'COP', probability: null },
      { amount: new Prisma.Decimal('100.00'), currency: 'COP', probability: new Prisma.Decimal(50) },
    ]);
    const result = await service.metric('sales.weighted_pipeline', { preset: 'month' }, own);
    expect(result.money).toEqual([{ currency: 'COP', amount: '50.00' }]);
    expect(result.coverage).toEqual(expect.objectContaining({ status: 'PARTIAL', covered: 1, total: 2, percentage: 50 }));
  });
  it('maneja win rate sin denominador como dato insuficiente', async () => {
    db.opportunity.count.mockResolvedValue(0);
    const result = await service.metric('sales.win_rate', { preset: 'month' }, own);
    expect(result.value).toBeNull();
    expect(result.denominator).toBe(0);
    expect(result.coverage.status).toBe('INSUFFICIENT_DATA');
  });
  it('deduplica reingreso por oportunidad en el funnel', async () => {
    db.pipelineStage.findMany.mockResolvedValue([{ id: 'new', key: 'new', name: 'Nuevo', position: 1 }, { id: 'contacted', key: 'contacted', name: 'Contactado', position: 2 }]);
    db.opportunityStageHistory.findMany.mockResolvedValueOnce([{ opportunityId: 'opp', newStageId: 'new', createdAt: new Date('2026-08-01') }, { opportunityId: 'opp', newStageId: 'new', createdAt: new Date('2026-08-02') }, { opportunityId: 'opp', newStageId: 'contacted', createdAt: new Date('2026-08-03') }]).mockResolvedValueOnce([]);
    const result = await service.funnel({ preset: 'month' }, own);
    expect(result.stages.map((stage) => stage.entered)).toEqual([1, 1]);
    expect(result.stages[0]!.conversionToNext).toBe(1);
  });
});
