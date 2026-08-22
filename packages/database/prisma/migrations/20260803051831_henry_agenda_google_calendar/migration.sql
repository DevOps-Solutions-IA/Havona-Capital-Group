-- CreateEnum
CREATE TYPE "CalendarProviderType" AS ENUM ('GOOGLE');

-- CreateEnum
CREATE TYPE "CalendarConnectionStatus" AS ENUM ('ACTIVE', 'NEEDS_REAUTHORIZATION', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "CalendarEventStatus" AS ENUM ('CONFIRMED', 'TENTATIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CalendarMutationStatus" AS ENUM ('PROCESSING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "calendar_connections" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "CalendarProviderType" NOT NULL DEFAULT 'GOOGLE',
    "provider_account_id" VARCHAR(254) NOT NULL,
    "account_email" VARCHAR(254) NOT NULL,
    "selected_calendar_id" VARCHAR(512) NOT NULL DEFAULT 'primary',
    "selected_calendar_name" VARCHAR(200),
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'America/Bogota',
    "encrypted_access_token" TEXT NOT NULL,
    "encrypted_refresh_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "granted_scopes" TEXT[],
    "status" "CalendarConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_synced_at" TIMESTAMP(3),
    "last_error_code" VARCHAR(80),
    "disconnected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_availability_rules" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'America/Bogota',
    "working_days" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "work_start" VARCHAR(5) NOT NULL DEFAULT '08:00',
    "work_end" VARCHAR(5) NOT NULL DEFAULT '18:00',
    "minimum_notice_minutes" INTEGER NOT NULL DEFAULT 120,
    "default_meeting_duration" INTEGER NOT NULL DEFAULT 45,
    "buffer_before_minutes" INTEGER NOT NULL DEFAULT 15,
    "buffer_after_minutes" INTEGER NOT NULL DEFAULT 15,
    "maximum_future_booking_days" INTEGER NOT NULL DEFAULT 90,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_event_links" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "provider_event_id" VARCHAR(512) NOT NULL,
    "provider_etag" VARCHAR(256),
    "calendar_id" VARCHAR(512) NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "timezone" VARCHAR(100) NOT NULL,
    "status" "CalendarEventStatus" NOT NULL DEFAULT 'CONFIRMED',
    "html_link" VARCHAR(1200),
    "conference_link" VARCHAR(1200),
    "attendees" JSONB,
    "prospect_id" UUID,
    "company_id" UUID,
    "opportunity_id" UUID,
    "conversation_id" UUID,
    "created_by_id" UUID NOT NULL,
    "cancellation_reason" VARCHAR(500),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_event_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_sync_states" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "sync_token" TEXT,
    "last_full_sync_at" TIMESTAMP(3),
    "last_sync_at" TIMESTAMP(3),
    "last_status" VARCHAR(40),
    "last_error_code" VARCHAR(80),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_sync_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_webhook_channels" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "channel_id" VARCHAR(160) NOT NULL,
    "resource_id" VARCHAR(256),
    "encrypted_token" TEXT NOT NULL,
    "expiration" TIMESTAMP(3) NOT NULL,
    "stopped_at" TIMESTAMP(3),
    "last_notification_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_webhook_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_mutations" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(120) NOT NULL,
    "operation" VARCHAR(40) NOT NULL,
    "status" "CalendarMutationStatus" NOT NULL DEFAULT 'PROCESSING',
    "result" JSONB,
    "error_code" VARCHAR(80),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_mutations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_oauth_states" (
    "id" UUID NOT NULL,
    "state_hash" CHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "encrypted_code_verifier" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendar_connections_user_id_status_idx" ON "calendar_connections"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_connections_provider_provider_account_id_user_id_key" ON "calendar_connections"("provider", "provider_account_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_availability_rules_user_id_key" ON "calendar_availability_rules"("user_id");

-- CreateIndex
CREATE INDEX "calendar_event_links_start_at_status_idx" ON "calendar_event_links"("start_at", "status");

-- CreateIndex
CREATE INDEX "calendar_event_links_prospect_id_start_at_idx" ON "calendar_event_links"("prospect_id", "start_at");

-- CreateIndex
CREATE INDEX "calendar_event_links_opportunity_id_start_at_idx" ON "calendar_event_links"("opportunity_id", "start_at");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_event_links_connection_id_provider_event_id_key" ON "calendar_event_links"("connection_id", "provider_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_sync_states_connection_id_key" ON "calendar_sync_states"("connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_webhook_channels_channel_id_key" ON "calendar_webhook_channels"("channel_id");

-- CreateIndex
CREATE INDEX "calendar_webhook_channels_connection_id_expiration_idx" ON "calendar_webhook_channels"("connection_id", "expiration");

-- CreateIndex
CREATE INDEX "calendar_mutations_created_at_idx" ON "calendar_mutations"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_mutations_connection_id_idempotency_key_key" ON "calendar_mutations"("connection_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_oauth_states_state_hash_key" ON "calendar_oauth_states"("state_hash");

-- CreateIndex
CREATE INDEX "calendar_oauth_states_user_id_expires_at_idx" ON "calendar_oauth_states"("user_id", "expires_at");

-- AddForeignKey
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_availability_rules" ADD CONSTRAINT "calendar_availability_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_links" ADD CONSTRAINT "calendar_event_links_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "calendar_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_links" ADD CONSTRAINT "calendar_event_links_prospect_id_fkey" FOREIGN KEY ("prospect_id") REFERENCES "prospects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_links" ADD CONSTRAINT "calendar_event_links_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "crm_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_links" ADD CONSTRAINT "calendar_event_links_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_links" ADD CONSTRAINT "calendar_event_links_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "henry_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_links" ADD CONSTRAINT "calendar_event_links_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_sync_states" ADD CONSTRAINT "calendar_sync_states_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "calendar_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_webhook_channels" ADD CONSTRAINT "calendar_webhook_channels_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "calendar_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_mutations" ADD CONSTRAINT "calendar_mutations_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "calendar_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
