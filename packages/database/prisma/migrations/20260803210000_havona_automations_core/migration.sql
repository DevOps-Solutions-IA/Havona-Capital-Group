CREATE TYPE "AutomationWorkflowStatus" AS ENUM ('DRAFT','ACTIVE','PAUSED','ARCHIVED');
CREATE TYPE "AutomationExecutionStatus" AS ENUM ('QUEUED','RUNNING','WAITING','PAUSED','AWAITING_APPROVAL','COMPLETED','FAILED','CANCELLED','SUPPRESSED');
CREATE TYPE "AutomationStepStatus" AS ENUM ('PENDING','RUNNING','WAITING','AWAITING_APPROVAL','COMPLETED','FAILED','SKIPPED','CANCELLED');
CREATE TYPE "AutomationApprovalStatus" AS ENUM ('PENDING','APPROVED','REJECTED','CANCELLED','EXPIRED');
CREATE TYPE "AutomationApprovalMode" AS ENUM ('AUTO','REQUIRES_CONFIRMATION','HUMAN_ONLY');
CREATE TYPE "AutomationOutboxStatus" AS ENUM ('PENDING','PROCESSING','PROCESSED','FAILED');

CREATE TABLE "automation_workflows" (
  "id" UUID NOT NULL, "name" VARCHAR(160) NOT NULL, "description" VARCHAR(1000),
  "status" "AutomationWorkflowStatus" NOT NULL DEFAULT 'DRAFT', "scope" VARCHAR(40) NOT NULL DEFAULT 'OWN',
  "version" INTEGER NOT NULL DEFAULT 1, "created_by_id" UUID NOT NULL, "owner_user_id" UUID,
  "max_steps" INTEGER NOT NULL DEFAULT 25, "max_duration_secs" INTEGER NOT NULL DEFAULT 86400,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "automation_workflows_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "automation_triggers" (
  "id" UUID NOT NULL, "workflow_id" UUID NOT NULL, "type" VARCHAR(100) NOT NULL, "definition" JSONB NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_triggers_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "automation_actions" (
  "id" UUID NOT NULL, "workflow_id" UUID NOT NULL, "step_order" INTEGER NOT NULL, "type" VARCHAR(100) NOT NULL,
  "definition" JSONB NOT NULL, "condition" JSONB, "approval_mode" "AutomationApprovalMode" NOT NULL DEFAULT 'AUTO',
  "retry_limit" INTEGER NOT NULL DEFAULT 3, "timeout_ms" INTEGER NOT NULL DEFAULT 30000,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "automation_actions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "automation_executions" (
  "id" UUID NOT NULL, "workflow_id" UUID NOT NULL, "workflow_version" INTEGER NOT NULL,
  "entity_type" VARCHAR(60) NOT NULL, "entity_id" UUID NOT NULL, "status" "AutomationExecutionStatus" NOT NULL DEFAULT 'QUEUED',
  "current_step" INTEGER NOT NULL DEFAULT 0, "idempotency_key" VARCHAR(255) NOT NULL, "correlation_id" VARCHAR(160) NOT NULL,
  "context" JSONB, "retries" INTEGER NOT NULL DEFAULT 0, "failure_code" VARCHAR(100), "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "automation_executions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "automation_step_executions" (
  "id" UUID NOT NULL, "execution_id" UUID NOT NULL, "action_id" UUID NOT NULL, "step_order" INTEGER NOT NULL,
  "status" "AutomationStepStatus" NOT NULL DEFAULT 'PENDING', "attempt" INTEGER NOT NULL DEFAULT 0,
  "input" JSONB, "output" JSONB, "failure_code" VARCHAR(100), "policy_id" VARCHAR(120), "rule_id" VARCHAR(120),
  "started_at" TIMESTAMP(3), "completed_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_step_executions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "automation_schedules" (
  "id" UUID NOT NULL, "workflow_id" UUID NOT NULL, "cron" VARCHAR(120), "run_at" TIMESTAMP(3),
  "timezone" VARCHAR(80) NOT NULL DEFAULT 'America/Bogota', "bull_job_id" VARCHAR(255), "is_active" BOOLEAN NOT NULL DEFAULT true,
  "next_run_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "automation_schedules_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "automation_enrollments" (
  "id" UUID NOT NULL, "workflow_id" UUID NOT NULL, "entity_type" VARCHAR(60) NOT NULL, "entity_id" UUID NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'ACTIVE', "enrolled_by_id" UUID, "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMP(3), CONSTRAINT "automation_enrollments_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "automation_events" (
  "id" UUID NOT NULL, "event_id" VARCHAR(160) NOT NULL, "type" VARCHAR(120) NOT NULL, "entity_type" VARCHAR(60) NOT NULL,
  "entity_id" UUID NOT NULL, "actor_user_id" UUID, "payload" JSONB NOT NULL, "occurred_at" TIMESTAMP(3) NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "processed_at" TIMESTAMP(3),
  CONSTRAINT "automation_events_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "automation_suppressions" (
  "id" UUID NOT NULL, "workflow_id" UUID, "entity_type" VARCHAR(60) NOT NULL, "entity_id" UUID NOT NULL,
  "channel" VARCHAR(30), "reason" VARCHAR(160) NOT NULL, "expires_at" TIMESTAMP(3), "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "automation_suppressions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "automation_approvals" (
  "id" UUID NOT NULL, "execution_id" UUID NOT NULL, "step_order" INTEGER NOT NULL,
  "status" "AutomationApprovalStatus" NOT NULL DEFAULT 'PENDING', "requested_by" VARCHAR(80) NOT NULL,
  "approver_user_id" UUID NOT NULL, "action_preview" JSONB NOT NULL, "expires_at" TIMESTAMP(3) NOT NULL,
  "resolved_at" TIMESTAMP(3), "resolution_note" VARCHAR(500), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_approvals_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "domain_outbox_events" (
  "id" UUID NOT NULL, "event_id" VARCHAR(160) NOT NULL, "aggregate_type" VARCHAR(80) NOT NULL, "aggregate_id" UUID NOT NULL,
  "event_type" VARCHAR(120) NOT NULL, "payload" JSONB NOT NULL, "status" "AutomationOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0, "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3), "failure_code" VARCHAR(100), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "domain_outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "automation_workflows_status_updated_at_idx" ON "automation_workflows"("status","updated_at");
CREATE INDEX "automation_workflows_owner_user_id_status_idx" ON "automation_workflows"("owner_user_id","status");
CREATE UNIQUE INDEX "automation_workflows_name_version_key" ON "automation_workflows"("name","version");
CREATE INDEX "automation_triggers_type_is_active_idx" ON "automation_triggers"("type","is_active");
CREATE UNIQUE INDEX "automation_actions_workflow_id_step_order_key" ON "automation_actions"("workflow_id","step_order");
CREATE UNIQUE INDEX "automation_executions_idempotency_key_key" ON "automation_executions"("idempotency_key");
CREATE INDEX "automation_executions_workflow_id_status_created_at_idx" ON "automation_executions"("workflow_id","status","created_at");
CREATE INDEX "automation_executions_entity_type_entity_id_status_idx" ON "automation_executions"("entity_type","entity_id","status");
CREATE INDEX "automation_step_executions_execution_id_step_order_idx" ON "automation_step_executions"("execution_id","step_order");
CREATE UNIQUE INDEX "automation_step_executions_execution_id_action_id_attempt_key" ON "automation_step_executions"("execution_id","action_id","attempt");
CREATE UNIQUE INDEX "automation_schedules_bull_job_id_key" ON "automation_schedules"("bull_job_id");
CREATE UNIQUE INDEX "automation_schedules_workflow_id_key" ON "automation_schedules"("workflow_id");
CREATE INDEX "automation_schedules_is_active_next_run_at_idx" ON "automation_schedules"("is_active","next_run_at");
CREATE UNIQUE INDEX "automation_enrollments_workflow_id_entity_type_entity_id_key" ON "automation_enrollments"("workflow_id","entity_type","entity_id");
CREATE INDEX "automation_enrollments_entity_type_entity_id_status_idx" ON "automation_enrollments"("entity_type","entity_id","status");
CREATE UNIQUE INDEX "automation_events_event_id_key" ON "automation_events"("event_id");
CREATE INDEX "automation_events_type_processed_at_occurred_at_idx" ON "automation_events"("type","processed_at","occurred_at");
CREATE INDEX "automation_suppressions_entity_type_entity_id_channel_expires_at_idx" ON "automation_suppressions"("entity_type","entity_id","channel","expires_at");
CREATE UNIQUE INDEX "automation_approvals_execution_id_step_order_key" ON "automation_approvals"("execution_id","step_order");
CREATE INDEX "automation_approvals_approver_user_id_status_expires_at_idx" ON "automation_approvals"("approver_user_id","status","expires_at");
CREATE UNIQUE INDEX "domain_outbox_events_event_id_key" ON "domain_outbox_events"("event_id");
CREATE INDEX "domain_outbox_events_status_available_at_idx" ON "domain_outbox_events"("status","available_at");

ALTER TABLE "automation_triggers" ADD CONSTRAINT "automation_triggers_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "automation_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_actions" ADD CONSTRAINT "automation_actions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "automation_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "automation_workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "automation_step_executions" ADD CONSTRAINT "automation_step_executions_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "automation_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_step_executions" ADD CONSTRAINT "automation_step_executions_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "automation_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "automation_schedules" ADD CONSTRAINT "automation_schedules_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "automation_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_enrollments" ADD CONSTRAINT "automation_enrollments_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "automation_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_suppressions" ADD CONSTRAINT "automation_suppressions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "automation_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_approvals" ADD CONSTRAINT "automation_approvals_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "automation_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
