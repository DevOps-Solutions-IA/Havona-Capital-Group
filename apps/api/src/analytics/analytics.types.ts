export type AnalyticsActor = { id: string; roles?: string[]; permissions: string[] };
export type AnalyticsScope = { kind: 'OWN' | 'TEAM' | 'GLOBAL'; userIds?: string[] };
export type AnalyticsPeriod = {
  start: Date;
  end: Date;
  timezone: string;
  preset: string;
};
export type AnalyticsCoverage = {
  status: 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT_DATA' | 'NOT_AVAILABLE';
  covered: number | null;
  total: number | null;
  percentage: number | null;
  warning?: string;
};
export type MetricResult = {
  metric: string;
  version: number;
  value: number | null;
  availability: 'available' | 'notAvailable';
  numerator?: number | null;
  denominator?: number | null;
  period: { start: string; end: string; timezone: string };
  scope: AnalyticsScope['kind'];
  coverage: AnalyticsCoverage;
  source: string[];
  generatedAt: string;
};

