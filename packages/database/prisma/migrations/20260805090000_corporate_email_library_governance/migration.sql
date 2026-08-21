ALTER TABLE "email_templates"
  ADD COLUMN "governance" JSONB,
  ADD COLUMN "content_owner" VARCHAR(80),
  ADD COLUMN "last_reviewed_at" TIMESTAMP(3),
  ADD COLUMN "next_review_at" TIMESTAMP(3);

ALTER TABLE "email_template_versions"
  ADD COLUMN "subject_alternatives" JSONB,
  ADD COLUMN "content_policy" JSONB,
  ADD COLUMN "legal_status" VARCHAR(60) NOT NULL DEFAULT 'LEGAL_REVIEW_REQUIRED';

CREATE INDEX "email_templates_next_review_at_status_idx"
  ON "email_templates"("next_review_at", "status");
