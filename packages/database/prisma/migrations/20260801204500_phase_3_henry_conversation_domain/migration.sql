CREATE TYPE "ConversationChannel" AS ENUM ('WEB', 'WHATSAPP', 'EMAIL', 'VOICE');
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'WAITING_HUMAN', 'CLOSED', 'BLOCKED');
CREATE TYPE "ConversationParticipantType" AS ENUM ('VISITOR', 'PROSPECT', 'USER', 'ASSISTANT');
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');
CREATE TYPE "MessageStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'COMPLETED', 'FAILED', 'BLOCKED');
CREATE TYPE "AIExecutionStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'ESCALATED', 'CONFIGURATION_REQUIRED');
CREATE TYPE "ToolCallStatus" AS ENUM ('REQUESTED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'REJECTED');
CREATE TYPE "EscalationReason" AS ENUM ('USER_REQUEST', 'SENSITIVE_CONTEXT', 'LOW_CONFIDENCE', 'UNSUPPORTED_INTENT', 'REPEATED_ERROR', 'HIGH_VALUE_CASE', 'AUTOMATION_LIMIT', 'POLICY');
CREATE TYPE "EscalationStatus" AS ENUM ('OPEN', 'ASSIGNED', 'RESOLVED', 'CANCELLED');

ALTER TYPE "ActivityType" ADD VALUE 'HENRY_CONVERSATION_STARTED';
ALTER TYPE "ActivityType" ADD VALUE 'HENRY_INTERACTION_RECORDED';
ALTER TYPE "ActivityType" ADD VALUE 'HENRY_ESCALATION_REQUESTED';
ALTER TYPE "ActivityType" ADD VALUE 'HENRY_APPOINTMENT_INTENT';
ALTER TABLE "crm_interactions" ALTER COLUMN "actor_id" DROP NOT NULL;
ALTER TABLE "crm_interactions" DROP CONSTRAINT "crm_interactions_actor_id_fkey";
ALTER TABLE "crm_interactions" ADD CONSTRAINT "crm_interactions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "henry_conversations" (
  "id" UUID NOT NULL,
  "public_id" UUID NOT NULL,
  "access_token_hash" CHAR(64) NOT NULL,
  "channel" "ConversationChannel" NOT NULL DEFAULT 'WEB',
  "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
  "intention" VARCHAR(80),
  "prospect_id" UUID,
  "consent_accepted_at" TIMESTAMP(3) NOT NULL,
  "privacy_version" VARCHAR(40) NOT NULL,
  "last_message_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "henry_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "henry_conversation_participants" (
  "id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "type" "ConversationParticipantType" NOT NULL,
  "user_id" UUID,
  "prospect_id" UUID,
  "display_name" VARCHAR(120),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "henry_conversation_participants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "henry_messages" (
  "id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "participant_id" UUID,
  "role" "MessageRole" NOT NULL,
  "channel" "ConversationChannel" NOT NULL DEFAULT 'WEB',
  "status" "MessageStatus" NOT NULL DEFAULT 'RECEIVED',
  "content" VARCHAR(8000) NOT NULL,
  "origin" VARCHAR(40) NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "henry_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "henry_conversation_states" (
  "conversation_id" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "state" JSONB NOT NULL,
  "summary" VARCHAR(2000),
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "henry_conversation_states_pkey" PRIMARY KEY ("conversation_id")
);

CREATE TABLE "henry_ai_executions" (
  "id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "input_message_id" UUID NOT NULL,
  "output_message_id" UUID,
  "provider" VARCHAR(40) NOT NULL,
  "model" VARCHAR(160) NOT NULL,
  "status" "AIExecutionStatus" NOT NULL DEFAULT 'RUNNING',
  "latency_ms" INTEGER,
  "iterations" INTEGER NOT NULL DEFAULT 0,
  "error_code" VARCHAR(80),
  "error_message" VARCHAR(500),
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "henry_ai_executions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "henry_tool_calls" (
  "id" UUID NOT NULL,
  "execution_id" UUID NOT NULL,
  "provider_id" VARCHAR(120),
  "name" VARCHAR(80) NOT NULL,
  "input" JSONB NOT NULL,
  "status" "ToolCallStatus" NOT NULL DEFAULT 'REQUESTED',
  "error_code" VARCHAR(80),
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "henry_tool_calls_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "henry_tool_results" (
  "id" UUID NOT NULL,
  "tool_call_id" UUID NOT NULL,
  "success" BOOLEAN NOT NULL,
  "output" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "henry_tool_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "henry_ai_usage" (
  "id" UUID NOT NULL,
  "execution_id" UUID NOT NULL,
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "total_tokens" INTEGER,
  "estimated_cost_usd" DECIMAL(18,8),
  "cost_source" VARCHAR(40),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "henry_ai_usage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "henry_escalations" (
  "id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "reason" "EscalationReason" NOT NULL,
  "status" "EscalationStatus" NOT NULL DEFAULT 'OPEN',
  "summary" VARCHAR(1200) NOT NULL,
  "assigned_to_id" UUID,
  "task_id" UUID,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "henry_escalations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "henry_conversations_public_id_key" ON "henry_conversations"("public_id");
CREATE INDEX "henry_conversations_status_last_message_at_idx" ON "henry_conversations"("status", "last_message_at");
CREATE INDEX "henry_conversations_prospect_id_created_at_idx" ON "henry_conversations"("prospect_id", "created_at");
CREATE INDEX "henry_conversations_channel_created_at_idx" ON "henry_conversations"("channel", "created_at");
CREATE INDEX "henry_conversation_participants_conversation_id_type_idx" ON "henry_conversation_participants"("conversation_id", "type");
CREATE INDEX "henry_conversation_participants_user_id_idx" ON "henry_conversation_participants"("user_id");
CREATE INDEX "henry_conversation_participants_prospect_id_idx" ON "henry_conversation_participants"("prospect_id");
CREATE INDEX "henry_messages_conversation_id_created_at_idx" ON "henry_messages"("conversation_id", "created_at");
CREATE INDEX "henry_ai_executions_conversation_id_started_at_idx" ON "henry_ai_executions"("conversation_id", "started_at");
CREATE INDEX "henry_ai_executions_status_started_at_idx" ON "henry_ai_executions"("status", "started_at");
CREATE INDEX "henry_tool_calls_execution_id_created_at_idx" ON "henry_tool_calls"("execution_id", "created_at");
CREATE UNIQUE INDEX "henry_tool_results_tool_call_id_key" ON "henry_tool_results"("tool_call_id");
CREATE UNIQUE INDEX "henry_ai_usage_execution_id_key" ON "henry_ai_usage"("execution_id");
CREATE INDEX "henry_escalations_status_created_at_idx" ON "henry_escalations"("status", "created_at");
CREATE INDEX "henry_escalations_conversation_id_created_at_idx" ON "henry_escalations"("conversation_id", "created_at");

ALTER TABLE "henry_conversations" ADD CONSTRAINT "henry_conversations_prospect_id_fkey" FOREIGN KEY ("prospect_id") REFERENCES "prospects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "henry_conversation_participants" ADD CONSTRAINT "henry_conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "henry_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "henry_conversation_participants" ADD CONSTRAINT "henry_conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "henry_conversation_participants" ADD CONSTRAINT "henry_conversation_participants_prospect_id_fkey" FOREIGN KEY ("prospect_id") REFERENCES "prospects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "henry_messages" ADD CONSTRAINT "henry_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "henry_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "henry_messages" ADD CONSTRAINT "henry_messages_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "henry_conversation_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "henry_conversation_states" ADD CONSTRAINT "henry_conversation_states_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "henry_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "henry_ai_executions" ADD CONSTRAINT "henry_ai_executions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "henry_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "henry_ai_executions" ADD CONSTRAINT "henry_ai_executions_input_message_id_fkey" FOREIGN KEY ("input_message_id") REFERENCES "henry_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "henry_ai_executions" ADD CONSTRAINT "henry_ai_executions_output_message_id_fkey" FOREIGN KEY ("output_message_id") REFERENCES "henry_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "henry_tool_calls" ADD CONSTRAINT "henry_tool_calls_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "henry_ai_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "henry_tool_results" ADD CONSTRAINT "henry_tool_results_tool_call_id_fkey" FOREIGN KEY ("tool_call_id") REFERENCES "henry_tool_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "henry_ai_usage" ADD CONSTRAINT "henry_ai_usage_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "henry_ai_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "henry_escalations" ADD CONSTRAINT "henry_escalations_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "henry_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "henry_escalations" ADD CONSTRAINT "henry_escalations_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "henry_escalations" ADD CONSTRAINT "henry_escalations_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "crm_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
