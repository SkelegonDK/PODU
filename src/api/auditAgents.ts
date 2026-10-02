// Audit ElevenLabs agent configurations
// Fetches each agent's config from the API and reports outdated models/settings

import { fetchElevenLabsJson } from "./elevenlabsClient";
import { resolveApiKey } from "../lib/session";

export interface AgentAuditResult {
  agentId: string;
  mode: string;
  name?: string;
  ttsModel?: string;
  llmModel?: string;
  llmProvider?: string;
  voiceId?: string;
  voiceName?: string;
  sttModel?: string;
  hasDeprecatedTools: boolean;
  issues: string[];
  raw?: Record<string, unknown>;
}

export interface AuditReport {
  timestamp: string;
  results: AgentAuditResult[];
  summary: { total: number; withIssues: number };
}

// Known latest/recommended models
const RECOMMENDED = {
  ttsModels: ["eleven_v4_turbo", "eleven_v4", "eleven_v3_conversational", "eleven_v3", "eleven_flash_v2_5", "eleven_multilingual_v2"],
  llmProviders: ["anthropic", "openai", "google", "elevenlabs"],
};

async function fetchAgentConfig(agentId: string, apiKey: string): Promise<Record<string, unknown>> {
  const result = await fetchElevenLabsJson<Record<string, unknown>>({
    path: `/v1/convai/agents/${encodeURIComponent(agentId)}`,
    apiKey,
  });

  if (!result.ok) {
    throw new Error(`Failed to fetch agent ${agentId}: ${result.message}`);
  }

  return result.data;
}

function analyzeAgent(config: Record<string, unknown>, mode: string, agentId: string): AgentAuditResult {
  const issues: string[] = [];

  // Extract nested config values safely
  const conversationConfig = config.conversation_config as Record<string, unknown> | undefined;
  const agent = conversationConfig?.agent as Record<string, unknown> | undefined;
  const prompt = agent?.prompt as Record<string, unknown> | undefined;
  const tts = conversationConfig?.tts as Record<string, unknown> | undefined;
  const stt = conversationConfig?.stt as Record<string, unknown> | undefined;
  const llm = prompt?.llm as Record<string, unknown> | string | undefined;
  const legacyLlm = typeof llm === "object" ? llm : undefined;

  const ttsModel = (tts?.model_id as string) || (tts?.model as string) || "unknown";
  const voiceId = (tts?.voice_id as string) || "unknown";
  const llmModel = (typeof llm === "string" ? llm : legacyLlm?.model as string) || (legacyLlm?.model_id as string) || "unknown";
  const llmProvider = (legacyLlm?.provider as string) || "unknown";
  const sttModel = (stt?.model as string) || (stt?.model_id as string) || "unknown";
  const agentName = (config.name as string) || "unnamed";

  // Check for deprecated prompt.tools (should use tool_ids after July 2025)
  const tools = prompt?.tools as unknown[] | undefined;
  const hasDeprecatedTools = Array.isArray(tools) && tools.some(tool => !tool || typeof tool !== "object" || !("type" in tool));
  if (hasDeprecatedTools) {
    issues.push(`Uses deprecated prompt.tools (${tools.length} tools). Migrate to prompt.tool_ids.`);
  }

  // Check TTS model
  if (ttsModel !== "unknown" && !RECOMMENDED.ttsModels.includes(ttsModel)) {
    issues.push(`TTS model "${ttsModel}" may be outdated. Recommended for PODU live conversations: eleven_v4_turbo.`);
  }

  // Check LLM provider
  if (llmProvider !== "unknown" && !RECOMMENDED.llmProviders.includes(llmProvider)) {
    issues.push(`LLM provider "${llmProvider}" is not a recognized provider.`);
  }

  return {
    agentId,
    mode,
    name: agentName,
    ttsModel,
    llmModel,
    llmProvider,
    voiceId,
    voiceName: undefined, // Would need separate voice API call
    sttModel,
    hasDeprecatedTools,
    issues,
    raw: config,
  };
}

/**
 * @param providedKey Optional explicit key. When omitted the key is resolved
 * through the same precedence helper the server uses (session first, then
 * `ELEVENLABS_API_KEY`); with no session, that is the env var — which is what
 * the CLI entry point relies on.
 */
export async function auditAgents(providedKey?: string): Promise<AuditReport> {
  const apiKey = providedKey ?? resolveApiKey({});
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY environment variable is not set");
  }

  const agentModes: { mode: string; envVar: string }[] = [
    { mode: "fun", envVar: "ELEVENLABS_AGENT_ID_FUN" },
    { mode: "edu", envVar: "ELEVENLABS_AGENT_ID_EDU" },
    { mode: "deep", envVar: "ELEVENLABS_AGENT_ID_DEEP" },
  ];

  const results: AgentAuditResult[] = [];

  for (const { mode, envVar } of agentModes) {
    const agentId = process.env[envVar];
    if (!agentId) {
      results.push({
        agentId: "missing",
        mode,
        hasDeprecatedTools: false,
        issues: [`Environment variable ${envVar} is not set`],
      });
      continue;
    }

    try {
      const config = await fetchAgentConfig(agentId, apiKey);
      results.push(analyzeAgent(config, mode, agentId));
    } catch (error) {
      results.push({
        agentId,
        mode,
        hasDeprecatedTools: false,
        issues: [error instanceof Error ? error.message : "Unknown error fetching agent config"],
      });
    }
  }

  const withIssues = results.filter(r => r.issues.length > 0).length;

  return {
    timestamp: new Date().toISOString(),
    results,
    summary: { total: results.length, withIssues },
  };
}
