import { BadRequestException } from '@nestjs/common';
import {
  KNOWLEDGE_AUTHORITY_RANK,
  canUseKnowledgeVersion,
  knowledgeValidityWarning,
  resolveKnowledgeGovernance,
} from './knowledge-governance';

describe('PALIG knowledge governance', () => {
  it('deriva el ranking en servidor y mantiene capacitación como no pública', () => {
    expect(resolveKnowledgeGovernance({ sourceType: 'CAPACITACION' })).toMatchObject({
      authorityLevel: 'TRAINING',
      authorityRank: 5,
      currentStatus: 'UNKNOWN',
      publicAllowed: false,
    });
    expect(KNOWLEDGE_AUTHORITY_RANK.CONTRACTUAL_GENERAL).toBeLessThan(
      KNOWLEDGE_AUTHORITY_RANK.TRAINING,
    );
  });

  it('rechaza una combinación de fuente/autoridad incoherente', () => {
    expect(() =>
      resolveKnowledgeGovernance({
        sourceType: 'CAPACITACION',
        authorityLevel: 'CONTRACTUAL_GENERAL',
      }),
    ).toThrow(BadRequestException);
  });

  it('impide publicar UNKNOWN, histórico o capacitación', () => {
    expect(() => resolveKnowledgeGovernance({ publicAllowed: true })).toThrow(
      'KNOWLEDGE_PUBLIC_REQUIRES_CURRENT',
    );
    expect(() =>
      resolveKnowledgeGovernance({
        sourceType: 'CAPACITACION',
        currentStatus: 'CURRENT',
        publicAllowed: true,
      }),
    ).toThrow('KNOWLEDGE_TRAINING_NOT_PUBLIC');
  });

  it('aplica visibilidad pública e interna server-side', () => {
    const version = {
      sourceType: 'CONTRACTUAL' as const,
      currentStatus: 'CURRENT' as const,
      publicAllowed: true,
      consultantAllowed: true,
      managerAllowed: true,
      trainingAllowed: false,
    };
    expect(canUseKnowledgeVersion(version, { id: 'public', roles: ['PUBLIC'], permissions: [] }))
      .toBe(true);
    expect(canUseKnowledgeVersion({ ...version, currentStatus: 'UNKNOWN' }, {
      id: 'public', roles: ['PUBLIC'], permissions: [],
    })).toBe(false);
    expect(knowledgeValidityWarning('UNKNOWN')).toContain('no confirmada');
    expect(knowledgeValidityWarning('HISTORICAL')).toContain('histórica');
  });
});
