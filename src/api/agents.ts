import type { ConversationMode } from "../components/ModeSelector";
import { AGENT_PROMPTS } from "./agentPrompts";
import { renderDocumentsContext, type StoredDocument } from "./knowledgebase";
import { fetchElevenLabsJson, type ElevenLabsFailure } from "./elevenlabsClient";
import { PODCAST_DIRECTION } from "./podcastProfile";

// Subject ID → display name mapping (must match SubjectSelector)
const SUBJECT_NAMES: Record<string, string> = {
  tech: "Technology",
  science: "Science",
  history: "History",
  philosophy: "Philosophy",
  business: "Business",
  health: "Health & Wellness",
  arts: "Arts & Culture",
};

// Agent ID env var names by mode
const AGENT_ID_ENV_VARS: Record<ConversationMode, string> = {
  fun: "ELEVENLABS_AGENT_ID_FUN",
  edu: "ELEVENLABS_AGENT_ID_EDU",
  deep: "ELEVENLABS_AGENT_ID_DEEP",
};

export interface GetAgentRequest {
  mode: ConversationMode;
  subjects: string[];
  /**
   * The documents to inject into the system prompt. Passed in rather than read
   * from storage here so prompt construction stays a pure function of its
   * arguments — src/index.ts is the one place that loads them.
   */
  documents: readonly StoredDocument[];
}

export interface GetAgentResponse {
  agentId: string;
  systemPrompt: string;
  firstMessage: string;
}

export function buildFullPrompt(
  mode: ConversationMode,
  subjectNames: string[],
  documents: readonly StoredDocument[],
): string {
  const basePrompt = AGENT_PROMPTS[mode].systemPrompt;

  const topicSection = subjectNames.length > 0
    ? `\n\nTOPIC FOCUS (NON-NEGOTIABLE):\nThe user has selected these specific topics: ${subjectNames.join(", ")}.\n- Discuss ONLY these topics.\n- Do NOT bring up artificial intelligence, machine learning, or any subject not in the list above, even tangentially.\n- If the conversation drifts off-topic, steer it back to the selected topics.`
    : "";

  const prompt = basePrompt + PODCAST_DIRECTION + topicSection + renderDocumentsContext(documents);

  // ElevenLabs silently DISCARDS an empty prompt override, which would hand the
  // caller a conversation running on the dashboard's default persona with no
  // error anywhere. Fail loudly instead.
  if (prompt.trim().length === 0) {
    throw new Error(`buildFullPrompt produced an empty system prompt for mode "${mode}"`);
  }

  return prompt;
}

export function resolveSubjectNames(subjectIds: string[]): string[] {
  return subjectIds.map(id => SUBJECT_NAMES[id] || id);
}

export class ConfigError extends Error {
  code: "missing_api_key" | "missing_agent_id" | "invalid_api_key" | "upstream_error";
  constructor(
    code: "missing_api_key" | "missing_agent_id" | "invalid_api_key" | "upstream_error",
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = "ConfigError";
  }
}

export async function getAgentForMode(request: GetAgentRequest): Promise<GetAgentResponse> {
  const { mode, subjects, documents } = request;
  const envVar = AGENT_ID_ENV_VARS[mode];
  const agentId = process.env[envVar];

  if (!agentId) {
    throw new ConfigError(
      "missing_agent_id",
      `No agent ID configured for ${mode.toUpperCase()} mode. Set ${envVar} in .env so the server can reach your ElevenLabs agent.`,
    );
  }

  const subjectNames = resolveSubjectNames(subjects);
  const systemPrompt = buildFullPrompt(mode, subjectNames, documents);
  const firstMessage = AGENT_PROMPTS[mode].buildFirstMessage(subjectNames);

  return { agentId, systemPrompt, firstMessage };
}

export async function getConversationToken(
  agentId: string,
  apiKey: string | null,
): Promise<string> {
  if (!apiKey) {
    throw new ConfigError(
      "missing_api_key",
      "No ElevenLabs API key is configured. Open Settings and paste your key to continue.",
    );
  }

  const result = await fetchElevenLabsJson<{ token: string }>({
    path: CONVERSATION_TOKEN_PATH,
    apiKey,
    query: { agent_id: agentId },
  });

  if (!result.ok) throw conversationTokenError(result);

  return result.data.token;
}

const CONVERSATION_TOKEN_PATH = "/v1/convai/conversation/token";

/** Maps a transport-level failure onto the ConfigError codes src/index.ts knows how to render. */
function conversationTokenError(failure: ElevenLabsFailure): ConfigError {
  switch (failure.kind) {
    case "unauthorized":
      return new ConfigError(
        "invalid_api_key",
        "ElevenLabs rejected the stored API key. Update it in Settings.",
      );
    case "network":
    case "timeout":
      return new ConfigError(
        "upstream_error",
        `Could not reach ElevenLabs to request the conversation token. ${failure.message}`,
      );
    case "invalid_response":
      return new ConfigError(
        "upstream_error",
        "ElevenLabs returned an unreadable response when requesting the conversation token.",
      );
    default:
      return new ConfigError(
        "upstream_error",
        `ElevenLabs returned HTTP ${failure.status} when requesting the conversation token.`,
      );
  }
}
