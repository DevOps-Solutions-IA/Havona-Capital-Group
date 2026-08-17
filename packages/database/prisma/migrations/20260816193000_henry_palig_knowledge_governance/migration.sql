CREATE TYPE "KnowledgeSourceType" AS ENUM ('CONTRACTUAL', 'CAPACITACION', 'COMERCIAL', 'SIMULADOR', 'HISTORICO_VERSION', 'TRIBUTARIO_USUARIO', 'INFERENCIA_CONSULTIVA', 'CORPORATIVO');
CREATE TYPE "KnowledgeAuthorityLevel" AS ENUM ('CUSTOMER_CONTRACTUAL', 'CONTRACTUAL_GENERAL', 'CUSTOMER_QUOTATION', 'OFFICIAL_TECHNICAL', 'TRAINING', 'COMMERCIAL', 'INTERPRETATION');
CREATE TYPE "KnowledgeCurrentStatus" AS ENUM ('CURRENT', 'HISTORICAL', 'UNKNOWN');
CREATE TYPE "KnowledgeConflictType" AS ENUM ('VERSION_CONFLICT', 'AUTHORITY_CONFLICT', 'VALIDITY_UNKNOWN', 'CUSTOMER_SPECIFIC');
CREATE TYPE "KnowledgeConflictStatus" AS ENUM ('OPEN', 'RESOLVED', 'ACCEPTED');

ALTER TABLE "knowledge_versions"
  ADD COLUMN "version_label" VARCHAR(120),
  ADD COLUMN "source_type" "KnowledgeSourceType" NOT NULL DEFAULT 'CORPORATIVO',
  ADD COLUMN "authority_level" "KnowledgeAuthorityLevel" NOT NULL DEFAULT 'OFFICIAL_TECHNICAL',
  ADD COLUMN "authority_rank" INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN "document_date" DATE,
  ADD COLUMN "current_status" "KnowledgeCurrentStatus" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "public_allowed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "consultant_allowed" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "manager_allowed" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "training_allowed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "carrier" "PaligCarrier",
  ADD COLUMN "authorized_product_id" UUID,
  ADD COLUMN "authorized_solution_id" UUID,
  ADD COLUMN "product_code" VARCHAR(100),
  ADD COLUMN "source_locator" VARCHAR(500),
  ADD COLUMN "country" VARCHAR(2) NOT NULL DEFAULT 'CO',
  ADD COLUMN "notes" VARCHAR(1000);

CREATE TABLE "knowledge_version_needs" (
  "version_id" UUID NOT NULL,
  "customer_need_id" UUID NOT NULL,
  CONSTRAINT "knowledge_version_needs_pkey" PRIMARY KEY ("version_id", "customer_need_id")
);

CREATE TABLE "knowledge_facts" (
  "id" UUID NOT NULL,
  "version_id" UUID NOT NULL,
  "claim_key" VARCHAR(200) NOT NULL,
  "subject" VARCHAR(200) NOT NULL,
  "predicate" VARCHAR(160) NOT NULL,
  "value" JSONB NOT NULL,
  "product_variant" VARCHAR(120),
  "plan" VARCHAR(80),
  "conditions" JSONB,
  "customer_specific" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_facts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "knowledge_conflicts" (
  "id" UUID NOT NULL,
  "type" "KnowledgeConflictType" NOT NULL,
  "status" "KnowledgeConflictStatus" NOT NULL DEFAULT 'OPEN',
  "topic" VARCHAR(200) NOT NULL,
  "primary_version_id" UUID NOT NULL,
  "secondary_version_id" UUID,
  "details" JSONB NOT NULL,
  "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  CONSTRAINT "knowledge_conflicts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "knowledge_facts_version_id_claim_key_key" ON "knowledge_facts"("version_id", "claim_key");
CREATE INDEX "knowledge_facts_claim_key_customer_specific_idx" ON "knowledge_facts"("claim_key", "customer_specific");
CREATE INDEX "knowledge_version_needs_customer_need_id_version_id_idx" ON "knowledge_version_needs"("customer_need_id", "version_id");
CREATE INDEX "knowledge_conflicts_status_type_detected_at_idx" ON "knowledge_conflicts"("status", "type", "detected_at");
CREATE INDEX "knowledge_conflicts_primary_version_id_status_idx" ON "knowledge_conflicts"("primary_version_id", "status");
CREATE INDEX "knowledge_conflicts_secondary_version_id_status_idx" ON "knowledge_conflicts"("secondary_version_id", "status");
CREATE INDEX "knowledge_versions_source_type_authority_rank_current_status_idx" ON "knowledge_versions"("source_type", "authority_rank", "current_status");
CREATE INDEX "knowledge_versions_authorized_product_id_current_status_idx" ON "knowledge_versions"("authorized_product_id", "current_status");
CREATE INDEX "knowledge_versions_authorized_solution_id_current_status_idx" ON "knowledge_versions"("authorized_solution_id", "current_status");

ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_authorized_product_id_fkey" FOREIGN KEY ("authorized_product_id") REFERENCES "authorized_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_authorized_solution_id_fkey" FOREIGN KEY ("authorized_solution_id") REFERENCES "authorized_solutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_version_needs" ADD CONSTRAINT "knowledge_version_needs_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "knowledge_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_version_needs" ADD CONSTRAINT "knowledge_version_needs_customer_need_id_fkey" FOREIGN KEY ("customer_need_id") REFERENCES "customer_needs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_facts" ADD CONSTRAINT "knowledge_facts_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "knowledge_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_conflicts" ADD CONSTRAINT "knowledge_conflicts_primary_version_id_fkey" FOREIGN KEY ("primary_version_id") REFERENCES "knowledge_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_conflicts" ADD CONSTRAINT "knowledge_conflicts_secondary_version_id_fkey" FOREIGN KEY ("secondary_version_id") REFERENCES "knowledge_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
