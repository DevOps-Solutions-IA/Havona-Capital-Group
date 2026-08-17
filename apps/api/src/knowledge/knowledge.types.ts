export type KnowledgeActor = { id: string; roles: string[]; permissions: string[] };
export const KNOWLEDGE_NOT_FOUND =
  'Esta información no se encuentra dentro de la base de conocimiento autorizada de HAVONA CAPITAL GROUP.';
export type KnowledgeCitation = {
  documentId: string;
  title: string;
  version: number;
  section: string | null;
  page: number | null;
  chunkId: string;
  snippet: string;
  sourceType: string;
  authorityRank: number;
  versionLabel: string | null;
  currentStatus: string;
  effectiveFrom: Date | null;
  effectiveUntil: Date | null;
  product: { id: string; name: string } | null;
  solution: { id: string; name: string } | null;
  customerNeeds: string[];
  conflicts: Array<{ type: string; topic: string }>;
  warning: string | null;
};
export type KnowledgeSearchResult = {
  answerStatus: 'GROUNDED' | 'INSUFFICIENT' | 'CONFLICT';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';
  query: string;
  results: Array<{ score: number; citation: KnowledgeCitation; content: string }>;
  message?: string;
  conflict?: { documents: Array<{ title: string; version: number }> };
};
