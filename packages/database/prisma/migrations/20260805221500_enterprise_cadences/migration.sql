CREATE TYPE "CadenceStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "CadenceEnrollmentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'STOPPED', 'FAILED', 'EXPIRED');
CREATE TYPE "CadenceStepExecutionStatus" AS ENUM ('SCHEDULED', 'CLAIMED', 'DISPATCHING', 'EXECUTED', 'SKIPPED', 'CANCELLED', 'FAILED');

CREATE TABLE "communication_cadences" (
  "id" UUID NOT NULL, "key" VARCHAR(120) NOT NULL, "name" VARCHAR(160) NOT NULL,
  "purpose" VARCHAR(500) NOT NULL, "status" "CadenceStatus" NOT NULL DEFAULT 'DRAFT',
  "owner_scope" VARCHAR(40) NOT NULL DEFAULT 'CORPORATE', "created_by_id" UUID NOT NULL,
  "active_version_id" UUID, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "communication_cadences_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "cadence_versions" (
  "id" UUID NOT NULL, "cadence_id" UUID NOT NULL, "version" INTEGER NOT NULL,
  "status" "CadenceStatus" NOT NULL DEFAULT 'DRAFT', "allowed_roles" TEXT[] NOT NULL,
  "channel_policy" JSONB NOT NULL, "enrollment_conditions" JSONB NOT NULL,
  "stop_conditions" TEXT[] NOT NULL, "approval_policy" VARCHAR(40) NOT NULL DEFAULT 'APPROVAL_REQUIRED',
  "frequency_policy" JSONB NOT NULL, "sending_window" JSONB NOT NULL,
  "max_lifetime_days" INTEGER NOT NULL DEFAULT 30, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approved_at" TIMESTAMP(3), CONSTRAINT "cadence_versions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "cadence_steps" (
  "id" UUID NOT NULL, "version_id" UUID NOT NULL, "step_order" INTEGER NOT NULL,
  "type" VARCHAR(40) NOT NULL, "delay_minutes" INTEGER NOT NULL DEFAULT 0,
  "template_key" VARCHAR(120), "approval_mode" "AutomationApprovalMode" NOT NULL DEFAULT 'REQUIRES_CONFIRMATION',
  "condition" JSONB, "required_evidence" TEXT[] NOT NULL, "definition" JSONB NOT NULL,
  CONSTRAINT "cadence_steps_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "cadence_enrollments" (
  "id" UUID NOT NULL, "version_id" UUID NOT NULL, "prospect_id" UUID,
  "opportunity_id" UUID, "communication_thread_id" UUID, "enrolled_by_id" UUID NOT NULL,
  "status" "CadenceEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE', "current_step" INTEGER NOT NULL DEFAULT 0,
  "idempotency_key" VARCHAR(190) NOT NULL, "timezone" VARCHAR(80) NOT NULL DEFAULT 'America/Bogota',
  "next_step_at" TIMESTAMP(3), "paused_at" TIMESTAMP(3), "expires_at" TIMESTAMP(3) NOT NULL,
  "stop_reason" VARCHAR(60), "stopped_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cadence_enrollments_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "cadence_step_executions" (
  "id" UUID NOT NULL, "enrollment_id" UUID NOT NULL, "step_id" UUID NOT NULL,
  "status" "CadenceStepExecutionStatus" NOT NULL DEFAULT 'SCHEDULED', "scheduled_at" TIMESTAMP(3) NOT NULL,
  "claimed_at" TIMESTAMP(3), "executed_at" TIMESTAMP(3), "bull_job_id" VARCHAR(255),
  "idempotency_key" VARCHAR(190) NOT NULL, "communication_id" UUID, "failure_code" VARCHAR(80),
  "result" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cadence_step_executions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "communication_cadences_key_key" ON "communication_cadences"("key");
CREATE UNIQUE INDEX "communication_cadences_active_version_id_key" ON "communication_cadences"("active_version_id");
CREATE INDEX "communication_cadences_status_updated_at_idx" ON "communication_cadences"("status", "updated_at");
CREATE UNIQUE INDEX "cadence_versions_cadence_id_version_key" ON "cadence_versions"("cadence_id", "version");
CREATE INDEX "cadence_versions_status_created_at_idx" ON "cadence_versions"("status", "created_at");
CREATE UNIQUE INDEX "cadence_steps_version_id_step_order_key" ON "cadence_steps"("version_id", "step_order");
CREATE UNIQUE INDEX "cadence_enrollments_idempotency_key_key" ON "cadence_enrollments"("idempotency_key");
CREATE INDEX "cadence_enrollments_prospect_id_status_next_step_at_idx" ON "cadence_enrollments"("prospect_id", "status", "next_step_at");
CREATE INDEX "cadence_enrollments_opportunity_id_status_next_step_at_idx" ON "cadence_enrollments"("opportunity_id", "status", "next_step_at");
CREATE INDEX "cadence_enrollments_communication_thread_id_status_idx" ON "cadence_enrollments"("communication_thread_id", "status");
CREATE INDEX "cadence_enrollments_enrolled_by_id_status_updated_at_idx" ON "cadence_enrollments"("enrolled_by_id", "status", "updated_at");
CREATE UNIQUE INDEX "cadence_step_executions_bull_job_id_key" ON "cadence_step_executions"("bull_job_id");
CREATE UNIQUE INDEX "cadence_step_executions_idempotency_key_key" ON "cadence_step_executions"("idempotency_key");
CREATE UNIQUE INDEX "cadence_step_executions_enrollment_id_step_id_key" ON "cadence_step_executions"("enrollment_id", "step_id");
CREATE INDEX "cadence_step_executions_status_scheduled_at_idx" ON "cadence_step_executions"("status", "scheduled_at");

ALTER TABLE "communication_cadences" ADD CONSTRAINT "communication_cadences_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "communication_cadences" ADD CONSTRAINT "communication_cadences_active_version_id_fkey" FOREIGN KEY ("active_version_id") REFERENCES "cadence_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cadence_versions" ADD CONSTRAINT "cadence_versions_cadence_id_fkey" FOREIGN KEY ("cadence_id") REFERENCES "communication_cadences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cadence_steps" ADD CONSTRAINT "cadence_steps_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "cadence_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cadence_enrollments" ADD CONSTRAINT "cadence_enrollments_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "cadence_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cadence_enrollments" ADD CONSTRAINT "cadence_enrollments_prospect_id_fkey" FOREIGN KEY ("prospect_id") REFERENCES "prospects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cadence_enrollments" ADD CONSTRAINT "cadence_enrollments_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cadence_enrollments" ADD CONSTRAINT "cadence_enrollments_communication_thread_id_fkey" FOREIGN KEY ("communication_thread_id") REFERENCES "communication_threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cadence_enrollments" ADD CONSTRAINT "cadence_enrollments_enrolled_by_id_fkey" FOREIGN KEY ("enrolled_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cadence_step_executions" ADD CONSTRAINT "cadence_step_executions_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "cadence_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cadence_step_executions" ADD CONSTRAINT "cadence_step_executions_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "cadence_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
