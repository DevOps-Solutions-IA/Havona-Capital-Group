CREATE TYPE "OpportunityCurrency" AS ENUM ('COP', 'USD');
CREATE TYPE "OpportunityForecastCategory" AS ENUM ('PIPELINE', 'LIKELY', 'COMMIT', 'UPSIDE');
CREATE TYPE "OpportunityFinancialSource" AS ENUM ('MANUAL', 'IMPORT', 'CRM_STAGE_POLICY', 'SYSTEM', 'EXTERNAL_FUTURE');

ALTER TABLE "opportunities"
  ADD COLUMN "amount" DECIMAL(19,2),
  ADD COLUMN "currency" "OpportunityCurrency",
  ADD COLUMN "expected_close_date" DATE,
  ADD COLUMN "probability" DECIMAL(5,2),
  ADD COLUMN "forecast_category" "OpportunityForecastCategory",
  ADD COLUMN "amount_source" "OpportunityFinancialSource",
  ADD COLUMN "expected_close_source" "OpportunityFinancialSource",
  ADD COLUMN "probability_source" "OpportunityFinancialSource",
  ADD COLUMN "forecast_category_source" "OpportunityFinancialSource",
  ADD COLUMN "financial_updated_at" TIMESTAMP(3),
  ADD COLUMN "financial_updated_by_id" UUID;

ALTER TABLE "opportunities"
  ADD CONSTRAINT "opportunities_amount_positive_check" CHECK ("amount" IS NULL OR "amount" > 0),
  ADD CONSTRAINT "opportunities_amount_currency_pair_check" CHECK (("amount" IS NULL) = ("currency" IS NULL)),
  ADD CONSTRAINT "opportunities_probability_range_check" CHECK ("probability" IS NULL OR ("probability" >= 0 AND "probability" <= 100));

ALTER TABLE "analytics_goals" ADD COLUMN "currency" "OpportunityCurrency";

CREATE TABLE "opportunity_financial_history" (
  "id" UUID NOT NULL,
  "opportunity_id" UUID NOT NULL,
  "field" VARCHAR(60) NOT NULL,
  "old_value" JSONB,
  "new_value" JSONB,
  "source" "OpportunityFinancialSource" NOT NULL,
  "reason" VARCHAR(500),
  "changed_by_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "opportunity_financial_history_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "opportunity_financial_history"
  ADD CONSTRAINT "opportunity_financial_history_opportunity_id_fkey"
  FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "opportunity_financial_history"
  ADD CONSTRAINT "opportunity_financial_history_changed_by_id_fkey"
  FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opportunities"
  ADD CONSTRAINT "opportunities_financial_updated_by_id_fkey"
  FOREIGN KEY ("financial_updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "opportunities_status_expected_close_date_idx" ON "opportunities"("status", "expected_close_date");
CREATE INDEX "opportunities_forecast_category_expected_close_date_idx" ON "opportunities"("forecast_category", "expected_close_date");
CREATE INDEX "opportunities_currency_status_idx" ON "opportunities"("currency", "status");
CREATE INDEX "opportunity_financial_history_opportunity_id_created_at_idx" ON "opportunity_financial_history"("opportunity_id", "created_at");
CREATE INDEX "opportunity_financial_history_changed_by_id_created_at_idx" ON "opportunity_financial_history"("changed_by_id", "created_at");
