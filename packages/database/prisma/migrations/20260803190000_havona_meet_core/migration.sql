CREATE TYPE "MeetingProviderType" AS ENUM ('JITSI');
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED','ACTIVE','COMPLETED','CANCELLED','FAILED');
CREATE TYPE "MeetingJoinPolicy" AS ENUM ('AUTHENTICATED','INVITED');
CREATE TYPE "MeetingGuestAccessPolicy" AS ENUM ('DISABLED','SIGNED_INVITATION');
CREATE TYPE "MeetingParticipantRole" AS ENUM ('HOST','MODERATOR','PARTICIPANT','GUEST');
CREATE TYPE "MeetingInvitationStatus" AS ENUM ('ACTIVE','REVOKED','USED');
CREATE TYPE "MeetingAttendanceEventType" AS ENUM ('STARTED','JOINED','LEFT','ENDED');

CREATE TABLE "meetings" (
  "id" UUID NOT NULL, "provider" "MeetingProviderType" NOT NULL DEFAULT 'JITSI',
  "provider_meeting_id" VARCHAR(180) NOT NULL, "idempotency_key" VARCHAR(120) NOT NULL,
  "title" VARCHAR(240) NOT NULL, "description" VARCHAR(2000), "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
  "scheduled_start_at" TIMESTAMP(3) NOT NULL, "scheduled_end_at" TIMESTAMP(3) NOT NULL, "timezone" VARCHAR(100) NOT NULL,
  "created_by_id" UUID NOT NULL, "owner_user_id" UUID NOT NULL, "assigned_consultant_id" UUID,
  "calendar_event_link_id" UUID, "prospect_id" UUID, "company_id" UUID, "opportunity_id" UUID, "conversation_id" UUID,
  "join_policy" "MeetingJoinPolicy" NOT NULL DEFAULT 'AUTHENTICATED', "guest_access_policy" "MeetingGuestAccessPolicy" NOT NULL DEFAULT 'SIGNED_INVITATION',
  "allow_guest_before_host" BOOLEAN NOT NULL DEFAULT false, "join_early_minutes" INTEGER NOT NULL DEFAULT 15,
  "join_late_minutes" INTEGER NOT NULL DEFAULT 30, "lobby_required" BOOLEAN NOT NULL DEFAULT true,
  "cancellation_reason" VARCHAR(500), "cancelled_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "meetings_provider_meeting_id_key" ON "meetings"("provider_meeting_id");
CREATE UNIQUE INDEX "meetings_idempotency_key_key" ON "meetings"("idempotency_key");
CREATE UNIQUE INDEX "meetings_calendar_event_link_id_key" ON "meetings"("calendar_event_link_id");
CREATE INDEX "meetings_owner_user_id_scheduled_start_at_idx" ON "meetings"("owner_user_id","scheduled_start_at");
CREATE INDEX "meetings_assigned_consultant_id_scheduled_start_at_idx" ON "meetings"("assigned_consultant_id","scheduled_start_at");
CREATE INDEX "meetings_prospect_id_scheduled_start_at_idx" ON "meetings"("prospect_id","scheduled_start_at");
CREATE INDEX "meetings_status_scheduled_start_at_idx" ON "meetings"("status","scheduled_start_at");

CREATE TABLE "meeting_participants" ("id" UUID NOT NULL,"meeting_id" UUID NOT NULL,"user_id" UUID NOT NULL,"role" "MeetingParticipantRole" NOT NULL DEFAULT 'PARTICIPANT',"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "meeting_participants_pkey" PRIMARY KEY("id"));
CREATE UNIQUE INDEX "meeting_participants_meeting_id_user_id_key" ON "meeting_participants"("meeting_id","user_id");
CREATE TABLE "meeting_invitations" ("id" UUID NOT NULL,"meeting_id" UUID NOT NULL,"token_hash" CHAR(64) NOT NULL,"expected_email" VARCHAR(254),"display_name" VARCHAR(120),"status" "MeetingInvitationStatus" NOT NULL DEFAULT 'ACTIVE',"expires_at" TIMESTAMP(3) NOT NULL,"created_by_id" UUID NOT NULL,"revoked_at" TIMESTAMP(3),"used_at" TIMESTAMP(3),"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "meeting_invitations_pkey" PRIMARY KEY("id"));
CREATE UNIQUE INDEX "meeting_invitations_token_hash_key" ON "meeting_invitations"("token_hash");
CREATE INDEX "meeting_invitations_meeting_id_status_expires_at_idx" ON "meeting_invitations"("meeting_id","status","expires_at");
CREATE TABLE "meeting_attendance_events" ("id" UUID NOT NULL,"meeting_id" UUID NOT NULL,"provider_event_id" VARCHAR(180) NOT NULL,"participant_external_id" VARCHAR(180),"type" "MeetingAttendanceEventType" NOT NULL,"occurred_at" TIMESTAMP(3) NOT NULL,"metadata" JSONB,"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "meeting_attendance_events_pkey" PRIMARY KEY("id"));
CREATE UNIQUE INDEX "meeting_attendance_events_provider_event_id_key" ON "meeting_attendance_events"("provider_event_id");
CREATE INDEX "meeting_attendance_events_meeting_id_occurred_at_idx" ON "meeting_attendance_events"("meeting_id","occurred_at");

ALTER TABLE "meetings" ADD CONSTRAINT "meetings_created_by_id_fkey" FOREIGN KEY("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_owner_user_id_fkey" FOREIGN KEY("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_assigned_consultant_id_fkey" FOREIGN KEY("assigned_consultant_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_calendar_event_link_id_fkey" FOREIGN KEY("calendar_event_link_id") REFERENCES "calendar_event_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_prospect_id_fkey" FOREIGN KEY("prospect_id") REFERENCES "prospects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_company_id_fkey" FOREIGN KEY("company_id") REFERENCES "crm_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_opportunity_id_fkey" FOREIGN KEY("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_conversation_id_fkey" FOREIGN KEY("conversation_id") REFERENCES "henry_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meeting_id_fkey" FOREIGN KEY("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_user_id_fkey" FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meeting_invitations" ADD CONSTRAINT "meeting_invitations_meeting_id_fkey" FOREIGN KEY("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meeting_invitations" ADD CONSTRAINT "meeting_invitations_created_by_id_fkey" FOREIGN KEY("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meeting_attendance_events" ADD CONSTRAINT "meeting_attendance_events_meeting_id_fkey" FOREIGN KEY("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
