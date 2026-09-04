export type HenryEvidenceLayer = 'PRODUCT_TRUTH' | 'SALES_INTELLIGENCE' | 'COMPLIANCE';

export type HenryTypedEvidence = {
  layer: HenryEvidenceLayer;
  documentId: string;
  collectionKey?: string;
  title: string;
  sourceType: string;
  authorityRank: number;
  currentStatus: string;
  conflicts: string[];
};

export type HenryEvidenceSnapshot = {
  productTruth: HenryTypedEvidence[];
  salesIntelligence: HenryTypedEvidence[];
  compliance: HenryTypedEvidence[];
};

const NON_PRODUCT_TRUTH_SOURCES = new Set(['CAPACITACION', 'COMERCIAL', 'INFERENCIA_CONSULTIVA']);

export class HenryEvidenceContext {
  private readonly evidence = new Map<string, HenryTypedEvidence>();

  ingest(toolName: string, output: Record<string, unknown>) {
    if (toolName !== 'search_knowledge') return;
    const results = Array.isArray(output.results) ? output.results : [];
    for (const item of results) {
      if (!item || typeof item !== 'object') continue;
      const citation = (item as { citation?: unknown }).citation;
      if (!citation || typeof citation !== 'object') continue;
      const raw = citation as Record<string, unknown>;
      if (
        typeof raw.documentId !== 'string' ||
        typeof raw.title !== 'string' ||
        typeof raw.sourceType !== 'string' ||
        typeof raw.authorityRank !== 'number' ||
        typeof raw.currentStatus !== 'string'
      )
        continue;
      const requestedLayer =
        typeof (item as Record<string, unknown>).evidenceLayer === 'string'
          ? (item as Record<string, unknown>).evidenceLayer
          : output.evidenceLayer;
      const derivedLayer = this.layer(raw.sourceType, raw.authorityRank, raw.title);
      const layer =
        requestedLayer === 'SALES_INTELLIGENCE'
          ? 'SALES_INTELLIGENCE'
          : requestedLayer === 'COMPLIANCE'
            ? 'COMPLIANCE'
            : derivedLayer;
      const conflicts = Array.isArray(raw.conflicts)
        ? raw.conflicts
            .map((conflict) =>
              conflict && typeof conflict === 'object' && 'type' in conflict
                ? String((conflict as { type: unknown }).type)
                : '',
            )
            .filter(Boolean)
        : [];
      const typed: HenryTypedEvidence = {
        layer,
        documentId: raw.documentId,
        collectionKey: typeof raw.collectionKey === 'string' ? raw.collectionKey : undefined,
        title: raw.title,
        sourceType: raw.sourceType,
        authorityRank: raw.authorityRank,
        currentStatus: raw.currentStatus,
        conflicts,
      };
      this.evidence.set(`${layer}:${typed.documentId}`, typed);
    }
  }

  snapshot(): HenryEvidenceSnapshot {
    const values = [...this.evidence.values()];
    return {
      productTruth: values.filter((item) => item.layer === 'PRODUCT_TRUTH'),
      salesIntelligence: values.filter((item) => item.layer === 'SALES_INTELLIGENCE'),
      compliance: values.filter((item) => item.layer === 'COMPLIANCE'),
    };
  }

  hasProductTruth() {
    return this.snapshot().productTruth.some((item) => item.currentStatus === 'CURRENT');
  }

  hasAny() {
    return this.evidence.size > 0;
  }

  collections() {
    return [
      ...new Set(
        [...this.evidence.values()]
          .map((item) => item.collectionKey)
          .filter((item): item is string => Boolean(item)),
      ),
    ];
  }

  private layer(sourceType: string, authorityRank: number, title: string): HenryEvidenceLayer {
    if (/compliance|cumplimiento|legal|pol[ií]tica/i.test(title)) return 'COMPLIANCE';
    if (!NON_PRODUCT_TRUTH_SOURCES.has(sourceType) && authorityRank <= 4) return 'PRODUCT_TRUTH';
    return 'SALES_INTELLIGENCE';
  }
}
