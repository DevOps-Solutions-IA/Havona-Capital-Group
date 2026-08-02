export const HENRY_MANUAL_VERSION = '1.0.0';

export const HENRY_CONVERSATION_STAGES = [
  'GREETING', 'DISCOVERY', 'DIAGNOSIS', 'QUALIFICATION', 'EDUCATION',
  'OBJECTION', 'CLOSING', 'APPOINTMENT', 'ESCALATION', 'FOLLOW_UP', 'SUPPORT',
] as const;

export type HenryConversationStage = (typeof HENRY_CONVERSATION_STAGES)[number];

export type HenryPolicyContext = {
  stage: HenryConversationStage;
  prospectAssociated: boolean;
  intention?: string | null;
  roleContext?: 'PUBLIC' | 'CLIENT' | 'CONSULTANT' | 'MANAGER' | 'ADMIN' | 'SUPER_ADMIN';
  pageContext?: Record<string, unknown>;
};

export type HenryPolicySection = {
  id: string;
  version: string;
  priority: number;
  title: string;
  instructions: readonly string[];
};

export interface HenryPolicy {
  section(context: HenryPolicyContext): HenryPolicySection;
}

export type HenryPolicyDecision = {
  action: 'ALLOW' | 'ESCALATE' | 'REJECT';
  policyId: string;
  ruleId: string;
  reason?: 'USER_REQUEST' | 'SENSITIVE_CONTEXT' | 'LOW_CONFIDENCE' | 'UNSUPPORTED_INTENT' | 'REPEATED_ERROR' | 'HIGH_VALUE_CASE' | 'AUTOMATION_LIMIT' | 'POLICY';
  response?: string;
  stage?: HenryConversationStage;
};
