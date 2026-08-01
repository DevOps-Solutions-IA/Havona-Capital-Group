export type HenryAdminConversation = {
  id: string;
  publicId: string;
  status: string;
  channel: string;
  intention?: string;
  createdAt: string;
  lastMessageAt?: string;
  prospect?: { id: string; name: string; email?: string };
  escalations: { id: string; reason: string; status: string }[];
  _count: { messages: number; executions: number };
};

export type HenryDashboard = {
  conversations: number;
  escalated: number;
  prospectLinked: number;
  toolCalls: number;
  errors: number;
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number; estimatedCostUsd?: string };
  generatedAt: string;
};

export type HenryAdminDetail = HenryAdminConversation & {
  prospect?: { id: string; name: string; email?: string; phone?: string; city: string; interest: string };
  messages: { id: string; role: string; content: string; status: string; origin: string; createdAt: string }[];
  executions: {
    id: string; provider: string; model: string; status: string; latencyMs?: number; iterations: number; errorCode?: string; startedAt: string;
    usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; estimatedCostUsd?: string };
    toolCalls: { id: string; name: string; status: string; errorCode?: string; createdAt: string; result?: { success: boolean; output: unknown } }[];
  }[];
  escalations: { id: string; reason: string; status: string; summary: string; createdAt: string; assignedTo?: { id: string; name: string } }[];
};
