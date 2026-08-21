CREATE TYPE "CommunicationChannel" AS ENUM ('WHATSAPP','EMAIL');
CREATE TYPE "CommunicationProviderType" AS ENUM ('META','RESEND');
CREATE TYPE "CommunicationThreadStatus" AS ENUM ('OPEN','PENDING','CLOSED','BLOCKED');
CREATE TYPE "CommunicationHandlingMode" AS ENUM ('HENRY','HUMAN','PAUSED','CLOSED');
CREATE TYPE "CommunicationDirection" AS ENUM ('INBOUND','OUTBOUND');
CREATE TYPE "CommunicationSenderType" AS ENUM ('CONTACT','USER','HENRY','SYSTEM');
CREATE TYPE "CommunicationContentType" AS ENUM ('TEXT','HTML','TEMPLATE','IMAGE','DOCUMENT','AUDIO');
CREATE TYPE "CommunicationMessageStatus" AS ENUM ('RECEIVED','QUEUED','SENT','DELIVERED','READ','FAILED','BLOCKED');
CREATE TYPE "CommunicationConsentStatus" AS ENUM ('UNKNOWN','OPTED_IN','OPTED_OUT','SUPPRESSED');
CREATE TYPE "CommunicationConnectionStatus" AS ENUM ('ACTIVE','DISABLED','ERROR');
CREATE TYPE "CommunicationWebhookStatus" AS ENUM ('RECEIVED','QUEUED','PROCESSED','FAILED');

CREATE TABLE "communication_threads" (
 "id" UUID NOT NULL,"channel" "CommunicationChannel" NOT NULL,"provider" "CommunicationProviderType" NOT NULL,"provider_thread_id" VARCHAR(255),"status" "CommunicationThreadStatus" NOT NULL DEFAULT 'OPEN',"handling_mode" "CommunicationHandlingMode" NOT NULL DEFAULT 'HUMAN',"subject" VARCHAR(300),"contact_identity" VARCHAR(320) NOT NULL,"contact_display_name" VARCHAR(160),"assigned_user_id" UUID,"prospect_id" UUID,"company_id" UUID,"opportunity_id" UUID,"conversation_id" UUID,"unread_count" INTEGER NOT NULL DEFAULT 0,"last_message_at" TIMESTAMP(3),"closed_at" TIMESTAMP(3),"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updated_at" TIMESTAMP(3) NOT NULL,CONSTRAINT "communication_threads_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "communication_participants" ("id" UUID NOT NULL,"thread_id" UUID NOT NULL,"identity" VARCHAR(320) NOT NULL,"display_name" VARCHAR(160),"sender_type" "CommunicationSenderType" NOT NULL,"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "communication_participants_pkey" PRIMARY KEY("id"));
CREATE TABLE "communication_messages" (
 "id" UUID NOT NULL,"thread_id" UUID NOT NULL,"provider_message_id" VARCHAR(255),"idempotency_key" VARCHAR(160) NOT NULL,"direction" "CommunicationDirection" NOT NULL,"sender_type" "CommunicationSenderType" NOT NULL,"sender_identity" VARCHAR(320) NOT NULL,"recipient_identity" VARCHAR(320) NOT NULL,"body_text" TEXT,"body_html" TEXT,"content_type" "CommunicationContentType" NOT NULL DEFAULT 'TEXT',"status" "CommunicationMessageStatus" NOT NULL DEFAULT 'RECEIVED',"reply_to_id" UUID,"metadata" JSONB,"error_code" VARCHAR(100),"created_by_id" UUID,"generated_by_henry" BOOLEAN NOT NULL DEFAULT false,"provider_created_at" TIMESTAMP(3),"sent_at" TIMESTAMP(3),"delivered_at" TIMESTAMP(3),"read_at" TIMESTAMP(3),"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updated_at" TIMESTAMP(3) NOT NULL,CONSTRAINT "communication_messages_pkey" PRIMARY KEY("id")
);
CREATE TABLE "communication_attachments" ("id" UUID NOT NULL,"message_id" UUID NOT NULL,"provider_media_id" VARCHAR(255),"file_name" VARCHAR(255),"mime_type" VARCHAR(120) NOT NULL,"size_bytes" INTEGER,"storage_key" VARCHAR(500),"expires_at" TIMESTAMP(3),"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "communication_attachments_pkey" PRIMARY KEY("id"));
CREATE TABLE "communication_channel_connections" ("id" UUID NOT NULL,"channel" "CommunicationChannel" NOT NULL,"provider" "CommunicationProviderType" NOT NULL,"external_account_id" VARCHAR(255),"display_name" VARCHAR(160),"status" "CommunicationConnectionStatus" NOT NULL DEFAULT 'DISABLED',"inbound_enabled" BOOLEAN NOT NULL DEFAULT false,"outbound_enabled" BOOLEAN NOT NULL DEFAULT false,"last_webhook_at" TIMESTAMP(3),"last_error_code" VARCHAR(100),"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updated_at" TIMESTAMP(3) NOT NULL,CONSTRAINT "communication_channel_connections_pkey" PRIMARY KEY("id"));
CREATE TABLE "communication_delivery_events" ("id" UUID NOT NULL,"message_id" UUID NOT NULL,"provider_event_id" VARCHAR(255),"status" "CommunicationMessageStatus" NOT NULL,"error_code" VARCHAR(100),"occurred_at" TIMESTAMP(3) NOT NULL,"metadata" JSONB,"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "communication_delivery_events_pkey" PRIMARY KEY("id"));
CREATE TABLE "communication_assignments" ("id" UUID NOT NULL,"thread_id" UUID NOT NULL,"assignee_id" UUID NOT NULL,"assigned_by_id" UUID NOT NULL,"ended_at" TIMESTAMP(3),"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "communication_assignments_pkey" PRIMARY KEY("id"));
CREATE TABLE "communication_consents" ("id" UUID NOT NULL,"thread_id" UUID NOT NULL,"commercial_status" "CommunicationConsentStatus" NOT NULL DEFAULT 'UNKNOWN',"service_status" "CommunicationConsentStatus" NOT NULL DEFAULT 'UNKNOWN',"source" VARCHAR(120),"evidence" JSONB,"opted_out_at" TIMESTAMP(3),"updated_at" TIMESTAMP(3) NOT NULL,"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "communication_consents_pkey" PRIMARY KEY("id"));
CREATE TABLE "communication_whatsapp_templates" ("id" UUID NOT NULL,"provider_template_id" VARCHAR(255),"name" VARCHAR(160) NOT NULL,"language" VARCHAR(20) NOT NULL,"status" VARCHAR(40) NOT NULL,"category" VARCHAR(80),"parameter_schema" JSONB,"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updated_at" TIMESTAMP(3) NOT NULL,CONSTRAINT "communication_whatsapp_templates_pkey" PRIMARY KEY("id"));
CREATE TABLE "communication_webhook_events" ("id" UUID NOT NULL,"provider" "CommunicationProviderType" NOT NULL,"provider_event_id" VARCHAR(255) NOT NULL,"event_type" VARCHAR(100) NOT NULL,"status" "CommunicationWebhookStatus" NOT NULL DEFAULT 'RECEIVED',"payload" JSONB NOT NULL,"attempts" INTEGER NOT NULL DEFAULT 0,"error_code" VARCHAR(100),"received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"processed_at" TIMESTAMP(3),CONSTRAINT "communication_webhook_events_pkey" PRIMARY KEY("id"));

CREATE UNIQUE INDEX "communication_threads_provider_provider_thread_id_key" ON "communication_threads"("provider","provider_thread_id");
CREATE INDEX "communication_threads_channel_status_last_message_at_idx" ON "communication_threads"("channel","status","last_message_at");
CREATE INDEX "communication_threads_assigned_user_id_status_last_message_at_idx" ON "communication_threads"("assigned_user_id","status","last_message_at");
CREATE INDEX "communication_threads_contact_identity_channel_idx" ON "communication_threads"("contact_identity","channel");
CREATE INDEX "communication_threads_prospect_id_last_message_at_idx" ON "communication_threads"("prospect_id","last_message_at");
CREATE UNIQUE INDEX "communication_participants_thread_id_identity_key" ON "communication_participants"("thread_id","identity");
CREATE UNIQUE INDEX "communication_messages_provider_message_id_key" ON "communication_messages"("provider_message_id");
CREATE UNIQUE INDEX "communication_messages_idempotency_key_key" ON "communication_messages"("idempotency_key");
CREATE INDEX "communication_messages_thread_id_created_at_idx" ON "communication_messages"("thread_id","created_at");
CREATE INDEX "communication_messages_status_created_at_idx" ON "communication_messages"("status","created_at");
CREATE INDEX "communication_attachments_message_id_idx" ON "communication_attachments"("message_id");
CREATE UNIQUE INDEX "communication_channel_connections_channel_provider_external_key" ON "communication_channel_connections"("channel","provider","external_account_id");
CREATE INDEX "communication_channel_connections_channel_status_idx" ON "communication_channel_connections"("channel","status");
CREATE UNIQUE INDEX "communication_delivery_events_provider_event_id_key" ON "communication_delivery_events"("provider_event_id");
CREATE INDEX "communication_delivery_events_message_id_occurred_at_idx" ON "communication_delivery_events"("message_id","occurred_at");
CREATE INDEX "communication_assignments_thread_id_ended_at_idx" ON "communication_assignments"("thread_id","ended_at");
CREATE INDEX "communication_assignments_assignee_id_ended_at_idx" ON "communication_assignments"("assignee_id","ended_at");
CREATE UNIQUE INDEX "communication_consents_thread_id_key" ON "communication_consents"("thread_id");
CREATE INDEX "communication_consents_commercial_status_updated_at_idx" ON "communication_consents"("commercial_status","updated_at");
CREATE UNIQUE INDEX "communication_whatsapp_templates_name_language_key" ON "communication_whatsapp_templates"("name","language");
CREATE UNIQUE INDEX "communication_webhook_events_provider_provider_event_id_key" ON "communication_webhook_events"("provider","provider_event_id");
CREATE INDEX "communication_webhook_events_status_received_at_idx" ON "communication_webhook_events"("status","received_at");

ALTER TABLE "communication_threads" ADD CONSTRAINT "communication_threads_assigned_user_id_fkey" FOREIGN KEY("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "communication_threads" ADD CONSTRAINT "communication_threads_prospect_id_fkey" FOREIGN KEY("prospect_id") REFERENCES "prospects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "communication_threads" ADD CONSTRAINT "communication_threads_company_id_fkey" FOREIGN KEY("company_id") REFERENCES "crm_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "communication_threads" ADD CONSTRAINT "communication_threads_opportunity_id_fkey" FOREIGN KEY("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "communication_threads" ADD CONSTRAINT "communication_threads_conversation_id_fkey" FOREIGN KEY("conversation_id") REFERENCES "henry_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "communication_participants" ADD CONSTRAINT "communication_participants_thread_id_fkey" FOREIGN KEY("thread_id") REFERENCES "communication_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_thread_id_fkey" FOREIGN KEY("thread_id") REFERENCES "communication_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_reply_to_id_fkey" FOREIGN KEY("reply_to_id") REFERENCES "communication_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_created_by_id_fkey" FOREIGN KEY("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "communication_attachments" ADD CONSTRAINT "communication_attachments_message_id_fkey" FOREIGN KEY("message_id") REFERENCES "communication_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "communication_delivery_events" ADD CONSTRAINT "communication_delivery_events_message_id_fkey" FOREIGN KEY("message_id") REFERENCES "communication_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "communication_assignments" ADD CONSTRAINT "communication_assignments_thread_id_fkey" FOREIGN KEY("thread_id") REFERENCES "communication_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "communication_assignments" ADD CONSTRAINT "communication_assignments_assignee_id_fkey" FOREIGN KEY("assignee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "communication_assignments" ADD CONSTRAINT "communication_assignments_assigned_by_id_fkey" FOREIGN KEY("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "communication_consents" ADD CONSTRAINT "communication_consents_thread_id_fkey" FOREIGN KEY("thread_id") REFERENCES "communication_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
