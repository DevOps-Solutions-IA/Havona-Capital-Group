CREATE TYPE "KnowledgeStagingStatus" AS ENUM ('STAGED', 'DUPLICATE', 'READY_FOR_REVIEW', 'PROMOTED', 'FAILED');
CREATE TYPE "KnowledgeScanStatus" AS ENUM ('PENDING_SCAN', 'CLEAN', 'QUARANTINED', 'SCAN_FAILED');
CREATE TYPE "KnowledgeStagingReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "knowledge_staged_assets" (
  "id" UUID NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "original_filename" VARCHAR(255) NOT NULL,
  "mime_type" VARCHAR(120) NOT NULL,
  "file_size" INTEGER NOT NULL,
  "storage_key" VARCHAR(500) NOT NULL,
  "status" "KnowledgeStagingStatus" NOT NULL DEFAULT 'STAGED',
  "scan_status" "KnowledgeScanStatus" NOT NULL DEFAULT 'PENDING_SCAN',
  "review_status" "KnowledgeStagingReviewStatus" NOT NULL DEFAULT 'PENDING',
  "duplicate_of_id" UUID,
  "proposed_source_type" "KnowledgeSourceType",
  "proposed_authority_level" "KnowledgeAuthorityLevel",
  "proposed_current_status" "KnowledgeCurrentStatus" NOT NULL DEFAULT 'UNKNOWN',
  "proposed_document_date" DATE,
  "proposed_version_label" VARCHAR(120),
  "proposed_authorized_product_id" UUID,
  "proposed_authorized_solution_id" UUID,
  "proposed_customer_needs" JSONB,
  "proposed_public_allowed" BOOLEAN NOT NULL DEFAULT false,
  "proposed_consultant_allowed" BOOLEAN NOT NULL DEFAULT true,
  "proposed_manager_allowed" BOOLEAN NOT NULL DEFAULT true,
  "proposed_training_allowed" BOOLEAN NOT NULL DEFAULT false,
  "carrier" "PaligCarrier",
  "country" VARCHAR(2) NOT NULL DEFAULT 'CO',
  "notes" VARCHAR(1000),
  "error_code" VARCHAR(100),
  "created_by_id" UUID NOT NULL,
  "reviewed_by_id" UUID,
  "reviewed_at" TIMESTAMP(3),
  "promoted_document_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "knowledge_staged_assets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "knowledge_staged_assets_sha256_created_at_idx" ON "knowledge_staged_assets"("sha256", "created_at");
CREATE INDEX "knowledge_staged_assets_status_scan_status_review_status_idx" ON "knowledge_staged_assets"("status", "scan_status", "review_status");
CREATE INDEX "knowledge_staged_assets_duplicate_of_id_idx" ON "knowledge_staged_assets"("duplicate_of_id");

ALTER TABLE "knowledge_staged_assets" ADD CONSTRAINT "knowledge_staged_assets_duplicate_of_id_fkey" FOREIGN KEY ("duplicate_of_id") REFERENCES "knowledge_staged_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_staged_assets" ADD CONSTRAINT "knowledge_staged_assets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_staged_assets" ADD CONSTRAINT "knowledge_staged_assets_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_staged_assets" ADD CONSTRAINT "knowledge_staged_assets_proposed_authorized_product_id_fkey" FOREIGN KEY ("proposed_authorized_product_id") REFERENCES "authorized_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_staged_assets" ADD CONSTRAINT "knowledge_staged_assets_proposed_authorized_solution_id_fkey" FOREIGN KEY ("proposed_authorized_solution_id") REFERENCES "authorized_solutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_staged_assets" ADD CONSTRAINT "knowledge_staged_assets_promoted_document_id_fkey" FOREIGN KEY ("promoted_document_id") REFERENCES "knowledge_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
