-- Enforce one active commercial owner per prospect while preserving assignment history.
CREATE UNIQUE INDEX "assignments_one_active_per_prospect"
ON "assignments" ("prospect_id")
WHERE "ended_at" IS NULL;

-- Closing timestamps and terminal statuses must remain coherent.
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_close_state_check"
CHECK (("status" = 'OPEN' AND "closed_at" IS NULL) OR ("status" <> 'OPEN' AND "closed_at" IS NOT NULL));

ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_completion_check"
CHECK (("status" = 'COMPLETED' AND "completed_at" IS NOT NULL) OR ("status" <> 'COMPLETED' AND "completed_at" IS NULL));

ALTER TABLE "crm_tags" ADD CONSTRAINT "crm_tags_color_check"
CHECK ("color" ~ '^#[0-9A-Fa-f]{6}$');
