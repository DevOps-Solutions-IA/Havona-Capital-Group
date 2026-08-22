CREATE TYPE "AnalyticsGoalStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "AnalyticsSignalSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE "AnalyticsSignalStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

CREATE TABLE "analytics_goals" (
  "id" UUID NOT NULL,
  "metric_key" VARCHAR(120) NOT NULL,
  "target_value" DECIMAL(20,4) NOT NULL,
  "unit" VARCHAR(30) NOT NULL,
  "scope_type" VARCHAR(30) NOT NULL,
  "scope_user_id" UUID,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "timezone" VARCHAR(80) NOT NULL DEFAULT 'America/Bogota',
  "status" "AnalyticsGoalStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_by_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "analytics_goals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "analytics_metric_snapshots" (
  "id" UUID NOT NULL,
  "metric_key" VARCHAR(120) NOT NULL,
  "metric_version" INTEGER NOT NULL,
  "scope_key" VARCHAR(160) NOT NULL,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "timezone" VARCHAR(80) NOT NULL,
  "value" DECIMAL(20,4),
  "numerator" DECIMAL(20,4),
  "denominator" DECIMAL(20,4),
  "coverage" JSONB NOT NULL,
  "dimensions" JSONB,
  "source_version" VARCHAR(80) NOT NULL,
  "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "analytics_metric_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "analytics_signals" (
  "id" UUID NOT NULL,
  "signal_key" VARCHAR(200) NOT NULL,
  "type" VARCHAR(100) NOT NULL,
  "severity" "AnalyticsSignalSeverity" NOT NULL,
  "status" "AnalyticsSignalStatus" NOT NULL DEFAULT 'OPEN',
  "entity_type" VARCHAR(60) NOT NULL,
  "entity_id" UUID NOT NULL,
  "owner_user_id" UUID,
  "score" INTEGER,
  "evidence" JSONB NOT NULL,
  "suggested_action" VARCHAR(120),
  "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "analytics_signals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "analytics_goals_metric_key_period_start_period_end_idx" ON "analytics_goals"("metric_key", "period_start", "period_end");
CREATE INDEX "analytics_goals_scope_type_scope_user_id_status_idx" ON "analytics_goals"("scope_type", "scope_user_id", "status");
CREATE UNIQUE INDEX "analytics_metric_snapshots_metric_key_metric_version_scope_key_period_start_period_end_key" ON "analytics_metric_snapshots"("metric_key", "metric_version", "scope_key", "period_start", "period_end");
CREATE INDEX "analytics_metric_snapshots_metric_key_computed_at_idx" ON "analytics_metric_snapshots"("metric_key", "computed_at");
CREATE UNIQUE INDEX "analytics_signals_signal_key_key" ON "analytics_signals"("signal_key");
CREATE INDEX "analytics_signals_status_severity_detected_at_idx" ON "analytics_signals"("status", "severity", "detected_at");
CREATE INDEX "analytics_signals_owner_user_id_status_detected_at_idx" ON "analytics_signals"("owner_user_id", "status", "detected_at");
CREATE INDEX "analytics_signals_entity_type_entity_id_idx" ON "analytics_signals"("entity_type", "entity_id");

ALTER TABLE "analytics_goals" ADD CONSTRAINT "analytics_goals_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "analytics_goals" ADD CONSTRAINT "analytics_goals_scope_user_id_fkey" FOREIGN KEY ("scope_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
