CREATE TYPE "KnowledgeExtractionStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "KnowledgePageExtractionStatus" AS ENUM ('EXTRACTED_NATIVE', 'EXTRACTED_OCR', 'EXTRACTED_MIXED', 'EMPTY_CONFIRMED', 'FAILED');
CREATE TYPE "KnowledgeChunkStructuralType" AS ENUM ('TEXT', 'TABLE', 'MIXED');

ALTER TABLE "knowledge_chunks"
  ADD COLUMN "structural_type" "KnowledgeChunkStructuralType" NOT NULL DEFAULT 'TEXT',
  ADD COLUMN "extraction_methods" JSONB,
  ADD COLUMN "extraction_warnings" JSONB,
  ADD COLUMN "structure" JSONB;

CREATE TABLE "knowledge_extraction_reports" (
  "id" UUID NOT NULL,
  "version_id" UUID NOT NULL,
  "status" "KnowledgeExtractionStatus" NOT NULL DEFAULT 'PROCESSING',
  "mime_type" VARCHAR(120) NOT NULL,
  "total_pages" INTEGER,
  "native_pages" INTEGER NOT NULL DEFAULT 0,
  "ocr_pages" INTEGER NOT NULL DEFAULT 0,
  "mixed_pages" INTEGER NOT NULL DEFAULT 0,
  "empty_confirmed_pages" INTEGER NOT NULL DEFAULT 0,
  "failed_pages" INTEGER NOT NULL DEFAULT 0,
  "pages_with_warnings" INTEGER NOT NULL DEFAULT 0,
  "characters_extracted" INTEGER NOT NULL DEFAULT 0,
  "tables_detected" INTEGER NOT NULL DEFAULT 0,
  "document_warnings" JSONB,
  "extractor_version" VARCHAR(80) NOT NULL,
  "ocr_provider" VARCHAR(80),
  "ocr_version" VARCHAR(80),
  "chunker_version" VARCHAR(80) NOT NULL,
  "extraction_started_at" TIMESTAMP(3) NOT NULL,
  "extraction_completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "knowledge_extraction_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "knowledge_page_extractions" (
  "id" UUID NOT NULL,
  "report_id" UUID NOT NULL,
  "page_number" INTEGER NOT NULL,
  "status" "KnowledgePageExtractionStatus" NOT NULL,
  "extraction_method" VARCHAR(40) NOT NULL,
  "native_characters" INTEGER NOT NULL DEFAULT 0,
  "final_characters" INTEGER NOT NULL DEFAULT 0,
  "tables_detected" INTEGER NOT NULL DEFAULT 0,
  "warnings" JSONB,
  "blocks" JSONB,
  "tables" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "knowledge_page_extractions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "knowledge_extraction_reports_version_id_key" ON "knowledge_extraction_reports"("version_id");
CREATE INDEX "knowledge_extraction_reports_status_updated_at_idx" ON "knowledge_extraction_reports"("status", "updated_at");
CREATE UNIQUE INDEX "knowledge_page_extractions_report_id_page_number_key" ON "knowledge_page_extractions"("report_id", "page_number");
CREATE INDEX "knowledge_page_extractions_status_updated_at_idx" ON "knowledge_page_extractions"("status", "updated_at");

ALTER TABLE "knowledge_extraction_reports" ADD CONSTRAINT "knowledge_extraction_reports_version_id_fkey"
  FOREIGN KEY ("version_id") REFERENCES "knowledge_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_page_extractions" ADD CONSTRAINT "knowledge_page_extractions_report_id_fkey"
  FOREIGN KEY ("report_id") REFERENCES "knowledge_extraction_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
