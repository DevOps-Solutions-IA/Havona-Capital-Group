ALTER TABLE "henry_ai_executions"
  ADD COLUMN "policy_context" JSONB;

ALTER TABLE "henry_tool_calls"
  ADD COLUMN "policy_id" VARCHAR(80),
  ADD COLUMN "rule_id" VARCHAR(120);

ALTER TABLE "henry_escalations"
  ADD COLUMN "policy_id" VARCHAR(80),
  ADD COLUMN "rule_id" VARCHAR(120);
