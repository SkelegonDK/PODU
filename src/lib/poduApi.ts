/**
 * The client's only door to the PODU server.
 *
 * Every `/api/*` call the browser makes goes through here, and every one of
 * them resolves — none of them throw. A request either produces the data the
 * route promised or an `ApiError` naming what went wrong, so callers branch on
 * a value instead of remembering to wrap each `fetch` in a try/catch. That is
 * the whole point: the nine hand-rolled fetch sites this replaces each decided
 * for themselves whether a non-2xx response, a malformed body, or a dead server
 * was worth reporting, and five of them silently decided it wasn't.
 *
 * What lives here: URLs, HTTP verbs, body encoding, and the translation of a
 * failed response into `{ code, message, status }`.
 *
 * What deliberately does NOT live here: user-facing wording. `ApiError.message`
 * is the server's sentence (or a terse fallback), not copy. Components turn an
 * `ApiError` into words with `failureCopyFromApiError` from ./failureCopy,
 * which stays the single place failures become English.
 */

import type { ConfigStatus, ConversationMode } from "@/shared/config";
// Type-only: erased at build time, so the browser bundle never reaches
// knowledgebase.ts (and through it `bun:sqlite`).
import type { DocumentMeta } from "@/api/knowledgebase";

export type ApiError = {
  /**
   * The server's own `code` when it named the failure (`missing_api_key`,
   * `unsupported_type`, …), otherwise `http_<status>` — or `network_error`
   * when the request never reached a server at all. `isServerNamedError`
   * tells the two apart.
   */
  code: string;
  /** The server's explanation, or a terse fallback when it sent none. */
  message: string;
  /** HTTP status, or 0 when the request never completed. */
  status: number;
};

export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; error: ApiError };

/** Code used when `fetch` itself rejects — no response, so no status. */
export const NETWORK_ERROR_CODE = "network_error";

const NETWORK_ERROR_MESSAGE =
  "Can't reach the PODU server — is bun dev still running?";

/**
 * True when the server named this failure itself, rather than us deriving a
 * code from the status. Callers use it to decide whether `message` is worth
 * showing verbatim: a named rejection carries a sentence written about this
 * exact request, an anonymous 500 carries nothing better than generic copy.
 */
export function isServerNamedError(error: ApiError): boolean {
  return error.code !== NETWORK_ERROR_CODE && !error.code.startsWith("http_");
}

/** Body shape every failing PODU route uses; both fields are best-effort. */
interface ErrorBody {
  error?: unknown;
  code?: unknown;
}

type AccessTokenProvider = () => Promise<string | null>;
let accessTokenProvider: AccessTokenProvider | null = null;

/** Install Clerk's fresh-token getter while the signed-in workspace is mounted. */
export function configureAccessToken(
  provider: AccessTokenProvider,
): () => void {
  accessTokenProvider = provider;
  return () => {
    if (accessTokenProvider === provider) accessTokenProvider = null;
  };
}

/** Parse a JSON body, tolerating an empty or non-JSON one. */
async function readBody(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/**
 * The one request primitive. Never throws; never rejects.
 *
 * `T` is asserted, not validated — these are our own routes, and a runtime
 * schema check would be a second source of truth for shapes the server already
 * types.
 */
async function call<T>(
  input: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const headers = new Headers(init?.headers);
  if (accessTokenProvider) {
    try {
      const token = await accessTokenProvider();
      if (!token) throw new Error("No active session");
      headers.set("Authorization", `Bearer ${token}`);
    } catch {
      return {
        ok: false,
        error: {
          code: "authentication_error",
          message: "Your session couldn’t be verified. Please sign in again.",
          status: 401,
        },
      };
    }
  }
  let response: Response;
  try {
    response = await fetch(input, { ...init, headers });
  } catch {
    return {
      ok: false,
      error: {
        code: NETWORK_ERROR_CODE,
        message: NETWORK_ERROR_MESSAGE,
        status: 0,
      },
    };
  }

  const body = await readBody(response);

  if (!response.ok) {
    const { error, code } = (body ?? {}) as ErrorBody;
    return {
      ok: false,
      error: {
        code:
          typeof code === "string" && code ? code : `http_${response.status}`,
        message:
          typeof error === "string" && error
            ? error
            : `Request failed with status ${response.status}.`,
        status: response.status,
      },
    };
  }

  return { ok: true, data: body as T };
}

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/** Everything the client needs to hand to `<ConversationView>`. */
export interface AgentSession {
  agentId: string;
  systemPrompt: string;
  firstMessage: string;
}

export function getConfig(): Promise<ApiResult<ConfigStatus>> {
  return call<ConfigStatus>("/api/config");
}

export function setApiKey(
  apiKey: string,
): Promise<ApiResult<{ ok: true; preview: string }>> {
  return call("/api/config", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ apiKey }),
  });
}

export function clearApiKey(): Promise<ApiResult<{ ok: true }>> {
  return call("/api/config", { method: "DELETE" });
}

export function getAgent(
  mode: ConversationMode,
  subjects: readonly string[],
): Promise<ApiResult<AgentSession>> {
  return call<AgentSession>("/api/agents", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ mode, subjects }),
  });
}

export function getConversationToken(
  agentId: string,
): Promise<ApiResult<{ token: string }>> {
  return call(`/api/agents/${encodeURIComponent(agentId)}/conversation-token`);
}

export function uploadDocument(file: File): Promise<ApiResult<DocumentMeta>> {
  const formData = new FormData();
  formData.append("file", file);
  // No Content-Type header: the browser must set the multipart boundary.
  return call<DocumentMeta>("/api/documents", {
    method: "POST",
    body: formData,
  });
}

export function deleteDocument(
  id: string,
): Promise<ApiResult<{ success: true }>> {
  return call(`/api/documents/${encodeURIComponent(id)}`, { method: "DELETE" });
}
