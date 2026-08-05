CREATE TYPE "HenryMessagingIntent" AS ENUM (
  'EMAIL_DRAFT',
  'EMAIL_EDIT',
  'EMAIL_PREVIEW',
  'EMAIL_SEND',
  'EMAIL_SCHEDULE',
  'EMAIL_REPLY',
  'EMAIL_ATTACH',
  'EMAIL_CANCEL_SCHEDULED',
  'EMAIL_BATCH_PREPARE'
);

CREATE TYPE "HenryMessagingOperationStatus" AS ENUM (
  'PREVIEW_READY',
  'AWAITING_CONFIRMATION',
  'CONFIRMED',
  'SCHEDULED',
  'QUEUED',
  'SENT',
  'PARTIAL_FAILED',
  'FAILED',
  'CANCELLED',
  'EXPIRED'
);

CREATE TABLE "henry_messaging_operations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "conversation_id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "intent" "HenryMessagingIntent" NOT NULL,
  "status" "HenryMessagingOperationStatus" NOT NULL DEFAULT 'PREVIEW_READY',
  "draft_id" UUID NOT NULL,
  "communication_thread_id" UUID,
  "communication_message_id" UUID,
  "template_version_id" UUID,
  "recipient_identity" VARCHAR(254) NOT NULL,
  "render_checksum" CHAR(64) NOT NULL,
  "attachment_checksum" CHAR(64) NOT NULL,
  "idempotency_key" VARCHAR(160) NOT NULL,
  "confirmation_level" VARCHAR(40) NOT NULL DEFAULT 'ALWAYS_CONFIRM',
  "confirmation_expires_at" TIMESTAMP(3),
  "confirmed_at" TIMESTAMP(3),
  "scheduled_at" TIMESTAMP(3),
  "timezone" VARCHAR(80),
  "bull_job_id" VARCHAR(255),
  "plan" JSONB,
  "result" JSONB,
  "cancelled_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "henry_messaging_operations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "henry_messaging_operations_idempotency_key_key"
  ON "henry_messaging_operations"("idempotency_key");
CREATE UNIQUE INDEX "henry_messaging_operations_bull_job_id_key"
  ON "henry_messaging_operations"("bull_job_id");
CREATE INDEX "henry_messaging_operations_conversation_id_created_at_idx"
  ON "henry_messaging_operations"("conversation_id", "created_at");
CREATE INDEX "henry_messaging_operations_actor_id_status_created_at_idx"
  ON "henry_messaging_operations"("actor_id", "status", "created_at");
CREATE INDEX "henry_messaging_operations_scheduled_at_status_idx"
  ON "henry_messaging_operations"("scheduled_at", "status");

ALTER TABLE "henry_messaging_operations"
  ADD CONSTRAINT "henry_messaging_operations_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "henry_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "henry_messaging_operations"
  ADD CONSTRAINT "henry_messaging_operations_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "henry_messaging_operations"
  ADD CONSTRAINT "henry_messaging_operations_draft_id_fkey"
  FOREIGN KEY ("draft_id") REFERENCES "email_template_drafts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "henry_messaging_operations"
  ADD CONSTRAINT "henry_messaging_operations_communication_message_id_fkey"
  FOREIGN KEY ("communication_message_id") REFERENCES "communication_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
