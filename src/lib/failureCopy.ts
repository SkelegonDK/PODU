/**
 * Single source of truth for user-facing failure copy.
 *
 * Every failure the UI can show is named by a `FailureCode` and rendered for a
 * `FailureSurface`. Components render what this module returns — they never
 * write their own strings — so one server code can no longer fan out into four
 * divergent phrasings.
 *
 * A failure is mapped exactly once, at the boundary where it enters the client:
 *
 *   - an `ApiError` returned by a `poduApi` call (the only way a server
 *     failure reaches the UI) -> `failureCopyFromApiError(error, surface, ctx)`
 *   - a thrown exception (getUserMedia, the ElevenLabs SDK's `onError`)
 *       -> `describeException(error, surface)`
 *
 * Both produce a `FailureCopy` object. Components store and render that object;
 * they never store a bare string and never feed a rendered message back into a
 * mapper. `describeException` is additionally idempotent — handed a
 * `FailureCopy` it returns it unchanged — so translating an already-translated
 * message is impossible even by accident.
 */

import type { ApiError } from "./poduApi";

/** Everything that can go wrong, named once. */
export type FailureCode =
  /** No ElevenLabs API key is stored for this session. */
  | "missing_api_key"
  /** ElevenLabs rejected the stored key (HTTP 401/403). */
  | "invalid_api_key"
  /** No `ELEVENLABS_AGENT_ID_*` is set for the mode(s) in question. */
  | "missing_agent_id"
  /** ElevenLabs itself errored. */
  | "upstream_error"
  /** Our own server errored (HTTP 5xx). */
  | "server_error"
  | "authentication_error"
  | "mic_permission_denied"
  | "mic_not_found"
  | "mic_in_use"
  /** Anything unrecognised. */
  | "unknown";

/**
 * Where the copy is rendered. Wording differs only where the user's next step
 * genuinely differs — a full-screen conversation has to be closed first, a
 * setup banner is a call to action rather than a report of a failure.
 */
export type FailureSurface =
  /** The landing page's error banner. */
  | "landing"
  /** The full-screen conversation view's error banner. */
  | "conversation"
  /** Pre-flight "not configured yet" notices (landing footer, settings dialog). */
  | "setup";

/** The remediation a surface should offer alongside the message. */
export type FailureAction =
  "open_settings" | "configure_env" | "retry" | "sign_in";

export interface FailureCopy {
  readonly code: FailureCode;
  readonly message: string;
  readonly action?: FailureAction;
}

export interface FailureContext {
  /** Single mode the failure concerns, e.g. `"fun"`. */
  mode?: string;
  /** Every mode missing an agent ID (settings dialog lists them together). */
  modes?: readonly string[];
  /** Message the server sent alongside the code, when it carries detail we don't have. */
  serverMessage?: string;
  /** HTTP status of the failed request. */
  status?: number;
}

const SERVER_FAILURE_CODES = [
  "missing_api_key",
  "invalid_api_key",
  "missing_agent_id",
  "upstream_error",
  "authentication_error",
] as const;

type ServerFailureCode = (typeof SERVER_FAILURE_CODES)[number];

function isServerFailureCode(code: string): code is ServerFailureCode {
  return (SERVER_FAILURE_CODES as readonly string[]).includes(code);
}

/** Normalise a `{ code }` from an API error body into a `FailureCode`. */
export function toFailureCode(
  code: string | null | undefined,
  status?: number,
): FailureCode {
  if (code && isServerFailureCode(code)) return code;
  if (status === 401) return "authentication_error";
  if (status !== undefined && status >= 500) return "server_error";
  return "unknown";
}

/**
 * True when the user's next step is to add or replace their API key. The one
 * place that decides whether a surface auto-opens Settings or renders an
 * "Open Settings" button.
 */
export function requiresApiKeyAction(
  code: FailureCode | string | null | undefined,
): boolean {
  return code === "missing_api_key" || code === "invalid_api_key";
}

export function isFailureCopy(value: unknown): value is FailureCopy {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { code?: unknown }).code === "string" &&
    typeof (value as { message?: unknown }).message === "string"
  );
}

function agentEnvVar(mode: string): string {
  return `ELEVENLABS_AGENT_ID_${mode.toUpperCase()}`;
}

function missingAgentMessage(context: FailureContext): string {
  const modes =
    context.modes && context.modes.length > 0
      ? context.modes
      : context.mode
        ? [context.mode]
        : [];

  const [first] = modes;
  if (!first) {
    return "No ElevenLabs agent is configured for this mode. Set the matching ELEVENLABS_AGENT_ID_* variable in .env and restart the server.";
  }
  if (modes.length === 1) {
    return `No agent configured for ${first.toUpperCase()} mode. Set ${agentEnvVar(first)} in .env and restart the server.`;
  }
  return `No agents configured for ${modes.map((mode) => mode.toUpperCase()).join(", ")}. Set ${modes
    .map(agentEnvVar)
    .join(", ")} in .env and restart the server.`;
}

function unknownMessage(
  surface: FailureSurface,
  context: FailureContext,
): string {
  if (context.serverMessage) return context.serverMessage;
  if (surface === "conversation") {
    return context.status !== undefined
      ? `Couldn't get a conversation token (HTTP ${context.status}). Try again, or check your API key in Settings.`
      : "Couldn't start the conversation. Try again, or check your API key in Settings.";
  }
  return "Failed to start the conversation. Try again.";
}

/** The one mapping from a named failure to the words the user reads. */
export function failureCopy(
  code: FailureCode,
  surface: FailureSurface,
  context: FailureContext = {},
): FailureCopy {
  switch (code) {
    case "authentication_error":
      return {
        code,
        action: "sign_in",
        message: "Your session couldn’t be verified. Please sign in again.",
      };

    case "missing_api_key":
      return {
        code,
        action: "open_settings",
        message:
          surface === "conversation"
            ? "No ElevenLabs API key is configured. Close this screen and add your key in Settings."
            : surface === "setup"
              ? "Add your ElevenLabs API key to begin"
              : "Add your ElevenLabs API key in Settings to start a conversation.",
      };

    case "invalid_api_key":
      return {
        code,
        action: "open_settings",
        message:
          surface === "conversation"
            ? "ElevenLabs rejected your API key. Close this screen and update it in Settings."
            : "ElevenLabs rejected your API key. Update it in Settings and try again.",
      };

    case "missing_agent_id":
      return {
        code,
        action: "configure_env",
        message: missingAgentMessage(context),
      };

    case "upstream_error":
      return {
        code,
        action: "retry",
        message:
          context.serverMessage ??
          "ElevenLabs is returning an error right now. Try again in a moment.",
      };

    case "server_error":
      return {
        code,
        action: "retry",
        message:
          context.serverMessage ??
          (surface === "conversation"
            ? "The server hit an error while requesting the ElevenLabs token. Check the server logs."
            : "Failed to start the conversation — the server returned an error. Check the server logs."),
      };

    case "mic_permission_denied":
      return {
        code,
        message:
          "Microphone access is blocked. Enable microphone permission for this site in your browser settings and try again.",
      };

    case "mic_not_found":
      return {
        code,
        message: "No microphone detected. Connect a microphone and try again.",
      };

    case "mic_in_use":
      return {
        code,
        message:
          "Your microphone is in use by another app. Close it and try again.",
      };

    case "unknown":
      return {
        code,
        action: "retry",
        message: unknownMessage(surface, context),
      };
  }
}

/**
 * Map a thrown value to copy. Only ever called with raw exceptions —
 * `getUserMedia` rejections, network failures, and the ElevenLabs SDK's
 * `onError`, which reports auth failures as free-text without a code.
 *
 * Idempotent: a `FailureCopy` passes straight through, so a message this module
 * already produced can never be re-mapped into different words.
 */
export function describeException(
  error: unknown,
  surface: FailureSurface = "conversation",
): FailureCopy {
  if (isFailureCopy(error)) return error;

  if (error instanceof Error) {
    const { name } = error;
    const message = error.message || "";

    // getUserMedia specifics
    if (name === "NotAllowedError" || /permission denied/i.test(message)) {
      return failureCopy("mic_permission_denied", surface);
    }
    if (name === "NotFoundError") return failureCopy("mic_not_found", surface);
    if (name === "NotReadableError") return failureCopy("mic_in_use", surface);

    // ElevenLabs WebRTC auth failures arrive here without a machine-readable code.
    if (
      /unauthor/i.test(message) ||
      /forbidden/i.test(message) ||
      /\b401\b/.test(message) ||
      /\b403\b/.test(message)
    ) {
      return failureCopy("invalid_api_key", surface);
    }

    if (message)
      return failureCopy("unknown", surface, { serverMessage: message });
  }

  return failureCopy("unknown", surface);
}

/**
 * Copy for a failure a `poduApi` call returned.
 *
 * This is the server-side half of the boundary: `poduApi` decides *what* went
 * wrong, this decides what the user reads about it. The `ApiError` is a value,
 * never a thrown one, so nothing produced here can reach `describeException`
 * and be translated a second time.
 */
export function failureCopyFromApiError(
  error: ApiError,
  surface: FailureSurface,
  context: FailureContext = {},
): FailureCopy {
  return failureCopy(toFailureCode(error.code, error.status), surface, {
    ...context,
    status: error.status,
    serverMessage: error.message,
  });
}
