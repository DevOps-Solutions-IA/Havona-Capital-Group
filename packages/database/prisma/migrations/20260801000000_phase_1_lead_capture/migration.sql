CREATE TYPE "ProspectStatus" AS ENUM ('NEW', 'REVIEWED', 'ARCHIVED');
CREATE TYPE "ConsentType" AS ENUM ('DATA_PROCESSING');
CREATE TYPE "LeadEventType" AS ENUM ('CAPTURED', 'RECAPTURED');

CREATE TABLE "lead_sources" (
  "id" UUID NOT NULL,
  "key" VARCHAR(40) NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lead_sources_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lead_sources_key_key" ON "lead_sources"("key");

CREATE TABLE "prospects" (
  "id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "phone" VARCHAR(30),
  "normalized_phone" VARCHAR(20),
  "email" VARCHAR(254),
  "normalized_email" VARCHAR(254),
  "city" VARCHAR(100) NOT NULL,
  "source_id" UUID NOT NULL,
  "campaign" VARCHAR(100),
  "landing" VARCHAR(80) NOT NULL,
  "interest" VARCHAR(60) NOT NULL,
  "message" VARCHAR(1200),
  "status" "ProspectStatus" NOT NULL DEFAULT 'NEW',
  "first_captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "prospects_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "prospects_normalized_email_key" ON "prospects"("normalized_email");
CREATE UNIQUE INDEX "prospects_normalized_phone_key" ON "prospects"("normalized_phone");
CREATE INDEX "prospects_status_created_at_idx" ON "prospects"("status", "created_at");
CREATE INDEX "prospects_source_id_created_at_idx" ON "prospects"("source_id", "created_at");
CREATE INDEX "prospects_landing_created_at_idx" ON "prospects"("landing", "created_at");

CREATE TABLE "consents" (
  "id" UUID NOT NULL,
  "prospect_id" UUID NOT NULL,
  "type" "ConsentType" NOT NULL DEFAULT 'DATA_PROCESSING',
  "accepted" BOOLEAN NOT NULL,
  "privacy_version" VARCHAR(40) NOT NULL,
  "ip_address" VARCHAR(64),
  "user_agent" VARCHAR(512),
  "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "consents_prospect_id_accepted_at_idx" ON "consents"("prospect_id", "accepted_at");

CREATE TABLE "lead_events" (
  "id" UUID NOT NULL,
  "prospect_id" UUID NOT NULL,
  "submission_id" UUID NOT NULL,
  "type" "LeadEventType" NOT NULL,
  "source_id" UUID NOT NULL,
  "landing" VARCHAR(80) NOT NULL,
  "campaign" VARCHAR(100),
  "interest" VARCHAR(60) NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "lead_events_prospect_id_created_at_idx" ON "lead_events"("prospect_id", "created_at");
CREATE INDEX "lead_events_type_created_at_idx" ON "lead_events"("type", "created_at");
CREATE INDEX "lead_events_source_id_created_at_idx" ON "lead_events"("source_id", "created_at");
CREATE UNIQUE INDEX "lead_events_submission_id_key" ON "lead_events"("submission_id");

ALTER TABLE "prospects" ADD CONSTRAINT "prospects_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "lead_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consents" ADD CONSTRAINT "consents_prospect_id_fkey" FOREIGN KEY ("prospect_id") REFERENCES "prospects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_prospect_id_fkey" FOREIGN KEY ("prospect_id") REFERENCES "prospects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "lead_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
