import type { ConfigStatus, ConversationMode } from "../shared/config";
import { readSession, writeSessionCookie, clearSessionCookie, resolveApiKey } from "../lib/session";
import { sendElevenLabsRequest } from "./elevenlabsClient";
import { backend, isLocalMode } from "../lib/backend";
import { api } from "../../convex/_generated/api";

const AGENT_ID_ENV_VARS: Record<ConversationMode, string> = {
  fun: "ELEVENLABS_AGENT_ID_FUN",
  edu: "ELEVENLABS_AGENT_ID_EDU",
  deep: "ELEVENLABS_AGENT_ID_DEEP",
};

/** The shape this module answers `GET /api/config` with; see ../shared/config. */
export type { ConfigStatus };

function mask(key: string): string {
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export async function getConfigStatus(req: Request): Promise<ConfigStatus> {
  const client = backend(req);
  if (client) return client.query(api.sessions.config, {});
  const session = await readSession(req);
  const sessionKey = session.apiKey ?? null;
  const envKey = process.env.ELEVENLABS_API_KEY ?? null;
  const activeKey = resolveApiKey(session);

  const agentIds = {
    fun: !!process.env[AGENT_ID_ENV_VARS.fun],
    edu: !!process.env[AGENT_ID_ENV_VARS.edu],
    deep: !!process.env[AGENT_ID_ENV_VARS.deep],
  };

  const missingAgentModes = (Object.keys(agentIds) as ConversationMode[]).filter(
    (mode) => !agentIds[mode],
  );

  return {
    hasApiKey: !!activeKey,
    apiKeySource: sessionKey ? "session" : envKey ? "env" : "none",
    apiKeyPreview: activeKey ? mask(activeKey) : null,
    agentIds,
    missingAgentModes,
  };
}

export async function verifyApiKey(apiKey: string): Promise<{
  ok: boolean;
  status: number;
  message: string;
}> {
  const result = await sendElevenLabsRequest({ path: "/v1/user", apiKey });

  if (result.ok) {
    return { ok: true, status: 200, message: "API key verified." };
  }

  switch (result.kind) {
    case "unauthorized":
      return {
        ok: false,
        status: 401,
        message:
          "ElevenLabs rejected the key. Double-check it in your ElevenLabs dashboard under Profile → API Keys.",
      };
    case "rate_limited":
      return {
        ok: false,
        status: 429,
        message:
          "ElevenLabs rate-limited the verification request. Wait a moment and try again.",
      };
    // status 0 keeps the "could not reach upstream" convention handleSetApiKey maps to 502.
    case "network":
    case "timeout":
      return { ok: false, status: 0, message: result.message };
    default:
      return {
        ok: false,
        status: result.status,
        message: `ElevenLabs returned HTTP ${result.status} when verifying the key.`,
      };
  }
}

export async function handleSetApiKey(req: Request): Promise<Response> {
  if (!isLocalMode()) return Response.json({ error: "The ElevenLabs key is managed by the server." }, { status: 403 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "Request body must be JSON with an 'apiKey' field." },
      { status: 400 },
    );
  }

  const apiKey =
    typeof body === "object" && body !== null && "apiKey" in body
      ? String((body as { apiKey?: unknown }).apiKey ?? "").trim()
      : "";

  if (!apiKey) {
    return Response.json(
      { error: "Provide your ElevenLabs API key." },
      { status: 400 },
    );
  }

  if (!/^[A-Za-z0-9_-]{16,}$/.test(apiKey)) {
    return Response.json(
      {
        error:
          "That doesn't look like an ElevenLabs key. Expected a long alphanumeric string (no spaces).",
      },
      { status: 400 },
    );
  }

  const verification = await verifyApiKey(apiKey);
  if (!verification.ok) {
    return Response.json(
      { error: verification.message },
      { status: verification.status === 0 ? 502 : verification.status },
    );
  }

  const cookie = await writeSessionCookie({ apiKey });
  return new Response(
    JSON.stringify({ ok: true, preview: mask(apiKey) }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookie,
      },
    },
  );
}

export function handleClearApiKey(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": clearSessionCookie(),
    },
  });
}

export { resolveApiKey };
