import { BadRequestException } from '@nestjs/common';
import type {
  KnowledgeAuthorityLevel,
  KnowledgeCurrentStatus,
  KnowledgeSourceType,
} from '@havona/database';
import type { KnowledgeActor } from './knowledge.types';

export const KNOWLEDGE_AUTHORITY_RANK: Record<KnowledgeAuthorityLevel, number> = {
  CUSTOMER_CONTRACTUAL: 1,
  CONTRACTUAL_GENERAL: 2,
  CUSTOMER_QUOTATION: 3,
  OFFICIAL_TECHNICAL: 4,
  TRAINING: 5,
  COMMERCIAL: 6,
  INTERPRETATION: 7,
};

const SOURCE_AUTHORITY: Record<KnowledgeSourceType, readonly KnowledgeAuthorityLevel[]> = {
  CONTRACTUAL: ['CUSTOMER_CONTRACTUAL', 'CONTRACTUAL_GENERAL'],
  SIMULADOR: ['CUSTOMER_QUOTATION'],
  CORPORATIVO: ['OFFICIAL_TECHNICAL'],
  CAPACITACION: ['TRAINING'],
  COMERCIAL: ['COMMERCIAL'],
  HISTORICO_VERSION: [
    'CONTRACTUAL_GENERAL',
    'CUSTOMER_QUOTATION',
    'OFFICIAL_TECHNICAL',
    'TRAINING',
    'COMMERCIAL',
  ],
  TRIBUTARIO_USUARIO: ['CUSTOMER_CONTRACTUAL'],
  INFERENCIA_CONSULTIVA: ['INTERPRETATION'],
};

export type KnowledgeGovernanceInput = {
  sourceType?: KnowledgeSourceType;
  authorityLevel?: KnowledgeAuthorityLevel;
  currentStatus?: KnowledgeCurrentStatus;
  publicAllowed?: boolean;
  consultantAllowed?: boolean;
  managerAllowed?: boolean;
  trainingAllowed?: boolean;
  carrier?: 'PAN_AMERICAN_LIFE_COLOMBIA';
};

export function resolveKnowledgeGovernance(input: KnowledgeGovernanceInput) {
  const sourceType = input.sourceType ?? 'CORPORATIVO';
  const authorityLevel = input.authorityLevel ?? defaultAuthority(sourceType);
  if (!SOURCE_AUTHORITY[sourceType].includes(authorityLevel)) {
    throw new BadRequestException('KNOWLEDGE_SOURCE_AUTHORITY_MISMATCH');
  }
  const currentStatus = input.currentStatus ?? 'UNKNOWN';
  if (input.publicAllowed && currentStatus !== 'CURRENT') {
    throw new BadRequestException('KNOWLEDGE_PUBLIC_REQUIRES_CURRENT');
  }
  if (sourceType === 'CAPACITACION' && input.publicAllowed) {
    throw new BadRequestException('KNOWLEDGE_TRAINING_NOT_PUBLIC');
  }
  return {
    sourceType,
    authorityLevel,
    authorityRank: KNOWLEDGE_AUTHORITY_RANK[authorityLevel],
    currentStatus,
    publicAllowed: input.publicAllowed ?? false,
    consultantAllowed: input.consultantAllowed ?? true,
    managerAllowed: input.managerAllowed ?? true,
    trainingAllowed: input.trainingAllowed ?? sourceType === 'CAPACITACION',
    carrier: input.carrier ?? null,
  };
}

export function canUseKnowledgeVersion(
  version: {
    currentStatus: KnowledgeCurrentStatus;
    publicAllowed: boolean;
    consultantAllowed: boolean;
    managerAllowed: boolean;
    trainingAllowed: boolean;
    sourceType: KnowledgeSourceType;
  },
  actor: KnowledgeActor,
) {
  if (actor.roles.includes('PUBLIC')) {
    return version.publicAllowed && version.currentStatus === 'CURRENT';
  }
  if (actor.roles.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN')) return true;
  if (actor.roles.includes('GERENTE') && !version.managerAllowed) return false;
  if (actor.roles.includes('CONSULTOR') && !version.consultantAllowed) return false;
  if (version.sourceType === 'CAPACITACION' && !version.trainingAllowed) return false;
  return true;
}

export function knowledgeValidityWarning(status: KnowledgeCurrentStatus) {
  if (status === 'UNKNOWN') return 'Vigencia no confirmada; no presentar como condición actual.';
  if (status === 'HISTORICAL') return 'Fuente histórica; no presentar como condición vigente.';
  return null;
}

function defaultAuthority(sourceType: KnowledgeSourceType): KnowledgeAuthorityLevel {
  return SOURCE_AUTHORITY[sourceType][0]!;
}
