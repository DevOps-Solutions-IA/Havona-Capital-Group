CREATE TYPE "VoiceSessionStatus" AS ENUM ('STARTING', 'ACTIVE', 'INTERRUPTED', 'COMPLETED', 'FAILED');
CREATE TYPE "VoiceOperation" AS ENUM ('STT', 'TTS');
CREATE TYPE "VoiceCostStatus" AS ENUM ('REPORTED', 'COST_PENDING_PROVIDER_RECONCILIATION');

CREATE TABLE "henry_voice_sessions" (
  "id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "provider" VARCHAR(40) NOT NULL,
  "external_conversation_id" VARCHAR(160),
  "authenticated_user_id" UUID,
  "role_context" VARCHAR(30) NOT NULL,
  "status" "VoiceSessionStatus" NOT NULL DEFAULT 'STARTING',
  "metadata" JSONB,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "henry_voice_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "henry_voice_usage" (
  "id" UUID NOT NULL,
  "voice_session_id" UUID NOT NULL,
  "operation" "VoiceOperation" NOT NULL,
  "latency_ms" INTEGER NOT NULL,
  "audio_duration_ms" INTEGER,
  "character_count" INTEGER,
  "provider_units" DECIMAL(18,6),
  "cost_usd" DECIMAL(18,8),
  "cost_status" "VoiceCostStatus" NOT NULL DEFAULT 'COST_PENDING_PROVIDER_RECONCILIATION',
  "failure_category" VARCHAR(80),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "henry_voice_usage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "henry_voice_sessions_provider_external_conversation_id_key"
  ON "henry_voice_sessions"("provider", "external_conversation_id");
CREATE INDEX "henry_voice_sessions_conversation_id_started_at_idx"
  ON "henry_voice_sessions"("conversation_id", "started_at");
CREATE INDEX "henry_voice_sessions_authenticated_user_id_started_at_idx"
  ON "henry_voice_sessions"("authenticated_user_id", "started_at");
CREATE INDEX "henry_voice_usage_voice_session_id_created_at_idx"
  ON "henry_voice_usage"("voice_session_id", "created_at");
CREATE INDEX "henry_voice_usage_operation_created_at_idx"
  ON "henry_voice_usage"("operation", "created_at");

ALTER TABLE "henry_voice_sessions"
  ADD CONSTRAINT "henry_voice_sessions_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "henry_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "henry_voice_sessions"
  ADD CONSTRAINT "henry_voice_sessions_authenticated_user_id_fkey"
  FOREIGN KEY ("authenticated_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "henry_voice_usage"
  ADD CONSTRAINT "henry_voice_usage_voice_session_id_fkey"
  FOREIGN KEY ("voice_session_id") REFERENCES "henry_voice_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
