-- CreateEnum
CREATE TYPE "EmailTemplateStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EmailTemplateScope" AS ENUM ('CORPORATE', 'PERSONAL');

-- CreateEnum
CREATE TYPE "EmailMessageClassification" AS ENUM ('TRANSACTIONAL', 'RELATIONSHIP', 'SERVICE', 'COMMERCIAL', 'MARKETING');

-- CreateEnum
CREATE TYPE "EmailDraftStatus" AS ENUM ('DRAFT', 'READY', 'AWAITING_APPROVAL', 'APPROVED', 'SCHEDULED', 'SENT', 'CANCELLED');

-- CreateTable
CREATE TABLE "email_templates" (
    "id" UUID NOT NULL,
    "key" VARCHAR(160) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "category" VARCHAR(60) NOT NULL,
    "purpose" VARCHAR(120) NOT NULL,
    "lifecycle_stage" VARCHAR(80),
    "scope" "EmailTemplateScope" NOT NULL,
    "owner_id" UUID,
    "locale" VARCHAR(20) NOT NULL DEFAULT 'es-CO',
    "status" "EmailTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "is_corporate" BOOLEAN NOT NULL DEFAULT false,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "active_version_id" UUID,
    "tags" TEXT[],
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_template_versions" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "locale" VARCHAR(20) NOT NULL,
    "status" "EmailTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "subject" VARCHAR(300) NOT NULL,
    "preheader" VARCHAR(300),
    "blocks" JSONB NOT NULL,
    "variable_contract" JSONB NOT NULL,
    "message_classification" "EmailMessageClassification" NOT NULL,
    "checksum" CHAR(64) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "activated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_template_variants" (
    "id" UUID NOT NULL,
    "parent_template_id" UUID NOT NULL,
    "parent_version_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "overrides" JSONB NOT NULL,
    "update_available" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_template_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_template_drafts" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "template_id" UUID,
    "template_version_id" UUID,
    "variant_id" UUID,
    "status" "EmailDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "recipient_prospect_id" UUID,
    "company_id" UUID,
    "opportunity_id" UUID,
    "communication_thread_id" UUID,
    "calendar_event_id" UUID,
    "meeting_id" UUID,
    "subject_override" VARCHAR(300),
    "editable_block_overrides" JSONB,
    "attachment_references" JSONB,
    "generated_by_henry" BOOLEAN NOT NULL DEFAULT false,
    "rendered_snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_template_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_signatures" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "display_name" VARCHAR(120) NOT NULL,
    "title" VARCHAR(120),
    "phone" VARCHAR(30),
    "email" VARCHAR(254) NOT NULL,
    "approved_links" JSONB,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_template_usages" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "template_version_id" UUID NOT NULL,
    "variant_id" UUID,
    "draft_id" UUID,
    "actor_id" UUID NOT NULL,
    "communication_message_id" UUID,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_template_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_templates_status_category_locale_idx" ON "email_templates"("status", "category", "locale");

-- CreateIndex
CREATE INDEX "email_templates_owner_id_status_idx" ON "email_templates"("owner_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_key_locale_owner_id_key" ON "email_templates"("key", "locale", "owner_id");

-- A NULL owner identifies the single corporate master for a key and locale.
CREATE UNIQUE INDEX "email_templates_corporate_key_locale_key" ON "email_templates"("key", "locale") WHERE "is_corporate" = true;

-- CreateIndex
CREATE INDEX "email_template_versions_template_id_status_version_idx" ON "email_template_versions"("template_id", "status", "version");

-- CreateIndex
CREATE UNIQUE INDEX "email_template_versions_template_id_version_key" ON "email_template_versions"("template_id", "version");

-- CreateIndex
CREATE INDEX "email_template_variants_owner_id_updated_at_idx" ON "email_template_variants"("owner_id", "updated_at");

-- CreateIndex
CREATE INDEX "email_template_variants_parent_template_id_parent_version_i_idx" ON "email_template_variants"("parent_template_id", "parent_version_id");

-- CreateIndex
CREATE INDEX "email_template_drafts_owner_id_status_updated_at_idx" ON "email_template_drafts"("owner_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "email_template_drafts_recipient_prospect_id_updated_at_idx" ON "email_template_drafts"("recipient_prospect_id", "updated_at");

-- CreateIndex
CREATE INDEX "email_template_drafts_communication_thread_id_idx" ON "email_template_drafts"("communication_thread_id");

-- CreateIndex
CREATE INDEX "email_signatures_owner_id_is_default_idx" ON "email_signatures"("owner_id", "is_default");

-- CreateIndex
CREATE INDEX "email_template_usages_template_id_created_at_idx" ON "email_template_usages"("template_id", "created_at");

-- CreateIndex
CREATE INDEX "email_template_usages_draft_id_idx" ON "email_template_usages"("draft_id");

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_template_versions" ADD CONSTRAINT "email_template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_template_versions" ADD CONSTRAINT "email_template_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_template_versions" ADD CONSTRAINT "email_template_versions_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_template_variants" ADD CONSTRAINT "email_template_variants_parent_template_id_fkey" FOREIGN KEY ("parent_template_id") REFERENCES "email_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_template_variants" ADD CONSTRAINT "email_template_variants_parent_version_id_fkey" FOREIGN KEY ("parent_version_id") REFERENCES "email_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_template_variants" ADD CONSTRAINT "email_template_variants_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_template_drafts" ADD CONSTRAINT "email_template_drafts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_template_drafts" ADD CONSTRAINT "email_template_drafts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_template_drafts" ADD CONSTRAINT "email_template_drafts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_template_drafts" ADD CONSTRAINT "email_template_drafts_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "email_template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_template_drafts" ADD CONSTRAINT "email_template_drafts_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "email_template_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_template_drafts" ADD CONSTRAINT "email_template_drafts_recipient_prospect_id_fkey" FOREIGN KEY ("recipient_prospect_id") REFERENCES "prospects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_template_drafts" ADD CONSTRAINT "email_template_drafts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "crm_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_template_drafts" ADD CONSTRAINT "email_template_drafts_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_template_drafts" ADD CONSTRAINT "email_template_drafts_communication_thread_id_fkey" FOREIGN KEY ("communication_thread_id") REFERENCES "communication_threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_template_drafts" ADD CONSTRAINT "email_template_drafts_calendar_event_id_fkey" FOREIGN KEY ("calendar_event_id") REFERENCES "calendar_event_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_template_drafts" ADD CONSTRAINT "email_template_drafts_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_signatures" ADD CONSTRAINT "email_signatures_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_template_usages" ADD CONSTRAINT "email_template_usages_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_template_usages" ADD CONSTRAINT "email_template_usages_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "email_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_template_usages" ADD CONSTRAINT "email_template_usages_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "email_template_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_template_usages" ADD CONSTRAINT "email_template_usages_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "email_template_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_template_usages" ADD CONSTRAINT "email_template_usages_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_template_usages" ADD CONSTRAINT "email_template_usages_communication_message_id_fkey" FOREIGN KEY ("communication_message_id") REFERENCES "communication_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
