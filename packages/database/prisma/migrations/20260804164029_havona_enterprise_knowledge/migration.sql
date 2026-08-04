-- CreateEnum
CREATE TYPE "KnowledgeDocumentStatus" AS ENUM ('DRAFT', 'PROCESSING', 'REVIEW', 'APPROVED', 'PUBLISHED', 'DEPRECATED', 'ARCHIVED', 'FAILED');

-- CreateEnum
CREATE TYPE "KnowledgeClassification" AS ENUM ('GENERAL', 'SALES', 'MANAGERS', 'ADMINISTRATION', 'COMPLIANCE', 'TRAINING', 'TECHNOLOGY');

-- CreateEnum
CREATE TYPE "KnowledgeIngestionStatus" AS ENUM ('UPLOAD', 'VALIDATION', 'EXTRACTION', 'NORMALIZATION', 'CHUNKING', 'EMBEDDING', 'INDEXING', 'REVIEW', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "TrainingEnrollmentStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TrainingQuestionType" AS ENUM ('MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER', 'SCENARIO');

-- CreateEnum
CREATE TYPE "MemoryCategory" AS ENUM ('EPHEMERAL', 'WORKING', 'PERSISTENT_ALLOWED', 'PERSISTENT_REQUIRES_CONFIRMATION', 'PROHIBITED');

-- CreateTable
CREATE TABLE "knowledge_collections" (
    "id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(600),
    "allowed_roles" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" UUID NOT NULL,
    "collection_id" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "description" VARCHAR(1000),
    "type" VARCHAR(40) NOT NULL,
    "language" VARCHAR(10) NOT NULL DEFAULT 'es',
    "classification" "KnowledgeClassification" NOT NULL,
    "status" "KnowledgeDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "owner_user_id" UUID NOT NULL,
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "tags" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_versions" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "KnowledgeDocumentStatus" NOT NULL DEFAULT 'PROCESSING',
    "checksum" CHAR(64) NOT NULL,
    "storage_key" VARCHAR(500),
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "effective_from" TIMESTAMP(3),
    "effective_until" TIMESTAMP(3),
    "change_summary" VARCHAR(1000),
    "created_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunks" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "section" VARCHAR(300),
    "heading_path" JSONB,
    "page_start" INTEGER,
    "page_end" INTEGER,
    "content" TEXT NOT NULL,
    "text_hash" CHAR(64) NOT NULL,
    "token_estimate" INTEGER NOT NULL,
    "embedding" JSONB,
    "embedding_model" VARCHAR(160),
    "embedding_dimension" INTEGER,
    "embedded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_ingestions" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "status" "KnowledgeIngestionStatus" NOT NULL DEFAULT 'UPLOAD',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "stage_log" JSONB NOT NULL,
    "error_code" VARCHAR(100),
    "error_message" VARCHAR(500),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_ingestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_permissions" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "role" VARCHAR(40),
    "user_id" UUID,
    "team_id" UUID,
    "can_download" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_gaps" (
    "id" UUID NOT NULL,
    "normalized_topic" VARCHAR(200) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "sample_queries" JSONB NOT NULL,
    "roles_affected" JSONB NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_gaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_programs" (
    "id" UUID NOT NULL,
    "collection_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_modules" (
    "id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "training_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_lessons" (
    "id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "knowledge_document_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "objective" VARCHAR(1000) NOT NULL,
    "content" TEXT,
    "estimated_minutes" INTEGER NOT NULL DEFAULT 15,
    "position" INTEGER NOT NULL,

    CONSTRAINT "training_lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_enrollments" (
    "id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "TrainingEnrollmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "completed_lesson_ids" JSONB NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "training_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_assessments" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "passing_score" INTEGER NOT NULL DEFAULT 70,
    "rubric" JSONB,

    CONSTRAINT "training_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_questions" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "type" "TrainingQuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB,
    "answer_key" JSONB NOT NULL,
    "rubric" JSONB,
    "points" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL,

    CONSTRAINT "training_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_attempts" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "answers" JSONB NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "feedback" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_roleplays" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "scenario_key" VARCHAR(100) NOT NULL,
    "difficulty" VARCHAR(30) NOT NULL,
    "objective" VARCHAR(500) NOT NULL,
    "transcript" JSONB NOT NULL,
    "rubric" JSONB NOT NULL,
    "score" DECIMAL(5,2),
    "feedback" JSONB,
    "status" VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "training_roleplays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "henry_memories" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "value" JSONB NOT NULL,
    "category" "MemoryCategory" NOT NULL,
    "source" VARCHAR(80) NOT NULL,
    "explicit" BOOLEAN NOT NULL DEFAULT true,
    "inferred_confidence" DECIMAL(5,4),
    "retention_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "henry_memories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_collections_key_key" ON "knowledge_collections"("key");

-- CreateIndex
CREATE INDEX "knowledge_documents_collection_id_status_updated_at_idx" ON "knowledge_documents"("collection_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "knowledge_documents_classification_status_idx" ON "knowledge_documents"("classification", "status");

-- CreateIndex
CREATE INDEX "knowledge_versions_status_effective_from_effective_until_idx" ON "knowledge_versions"("status", "effective_from", "effective_until");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_versions_document_id_version_key" ON "knowledge_versions"("document_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_versions_document_id_checksum_key" ON "knowledge_versions"("document_id", "checksum");

-- CreateIndex
CREATE INDEX "knowledge_chunks_version_id_position_idx" ON "knowledge_chunks"("version_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_chunks_version_id_position_key" ON "knowledge_chunks"("version_id", "position");

-- CreateIndex
CREATE INDEX "knowledge_ingestions_status_updated_at_idx" ON "knowledge_ingestions"("status", "updated_at");

-- CreateIndex
CREATE INDEX "knowledge_permissions_document_id_role_user_id_team_id_idx" ON "knowledge_permissions"("document_id", "role", "user_id", "team_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_gaps_normalized_topic_key" ON "knowledge_gaps"("normalized_topic");

-- CreateIndex
CREATE INDEX "knowledge_gaps_status_count_last_seen_at_idx" ON "knowledge_gaps"("status", "count", "last_seen_at");

-- CreateIndex
CREATE INDEX "training_programs_status_updated_at_idx" ON "training_programs"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "training_modules_program_id_position_key" ON "training_modules"("program_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "training_lessons_module_id_position_key" ON "training_lessons"("module_id", "position");

-- CreateIndex
CREATE INDEX "training_enrollments_user_id_status_idx" ON "training_enrollments"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "training_enrollments_program_id_user_id_key" ON "training_enrollments"("program_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "training_questions_assessment_id_position_key" ON "training_questions"("assessment_id", "position");

-- CreateIndex
CREATE INDEX "training_attempts_user_id_created_at_idx" ON "training_attempts"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "training_roleplays_user_id_status_created_at_idx" ON "training_roleplays"("user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "henry_memories_user_id_category_retention_until_idx" ON "henry_memories"("user_id", "category", "retention_until");

-- CreateIndex
CREATE UNIQUE INDEX "henry_memories_user_id_key_key" ON "henry_memories"("user_id", "key");

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "knowledge_collections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "knowledge_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_ingestions" ADD CONSTRAINT "knowledge_ingestions_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "knowledge_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_permissions" ADD CONSTRAINT "knowledge_permissions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_programs" ADD CONSTRAINT "training_programs_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "knowledge_collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_programs" ADD CONSTRAINT "training_programs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_modules" ADD CONSTRAINT "training_modules_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "training_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_lessons" ADD CONSTRAINT "training_lessons_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "training_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_lessons" ADD CONSTRAINT "training_lessons_knowledge_document_id_fkey" FOREIGN KEY ("knowledge_document_id") REFERENCES "knowledge_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_enrollments" ADD CONSTRAINT "training_enrollments_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "training_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_enrollments" ADD CONSTRAINT "training_enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_assessments" ADD CONSTRAINT "training_assessments_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "training_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_questions" ADD CONSTRAINT "training_questions_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "training_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_attempts" ADD CONSTRAINT "training_attempts_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "training_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_attempts" ADD CONSTRAINT "training_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_roleplays" ADD CONSTRAINT "training_roleplays_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "henry_memories" ADD CONSTRAINT "henry_memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
