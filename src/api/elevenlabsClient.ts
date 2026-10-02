// Single entry point for every outbound ElevenLabs HTTP call.
//
// Owns: the base URL, the `xi-api-key` header, URL/query encoding, the request
// timeout, and the translation of *any* failure mode (HTTP status, network
// rejection, timeout, unparseable body) into one typed result. Callers never
// touch `fetch` directly and never have to catch — they pattern-match on
// `result.ok` and map the failure into whatever error shape their layer uses.

export const ELEVENLABS_API_BASE_URL = "https://api.elevenlabs.io";

/** How long any single ElevenLabs request may take before it is aborted. */
export const ELEVENLABS_REQUEST_TIMEOUT_MS = 10_000;

export type ElevenLabsFailureKind =
  /** HTTP 401 — the key was rejected. */
  | "unauthorized"
  /** HTTP 429 — the key is being throttled. */
  | "rate_limited"
  /** Any other non-2xx response. */
  | "http_error"
  /** fetch() rejected: DNS failure, offline, TLS error, connection reset. */
  | "network"
  /** The request was aborted because it exceeded the timeout. */
  | "timeout"
  /** 2xx response whose body was not the JSON we expected. */
  | "invalid_response";

export interface ElevenLabsSuccess<T> {
  ok: true;
  status: number;
  data: T;
}

export interface ElevenLabsFailure {
  ok: false;
  kind: ElevenLabsFailureKind;
  /** HTTP status, or 0 when the request never produced a response. */
  status: number;
  statusText: string;
  /** Human-readable, safe to surface. Never contains the API key. */
  message: string;
}

export type ElevenLabsResult<T> = ElevenLabsSuccess<T> | ElevenLabsFailure;

export interface ElevenLabsRequestOptions {
  /** Path beginning with a slash, e.g. "/v1/user". Interpolated segments must already be encoded. */
  path: string;
  apiKey: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  /** Query parameters. Values are URL-encoded here — callers must not pre-encode. */
  query?: Record<string, string>;
  timeoutMs?: number;
  body?: unknown;
}

/** Builds a fully-encoded ElevenLabs URL. Exported for tests. */
export function buildElevenLabsUrl(path: string, query?: Record<string, string>): string {
  const url = `${ELEVENLABS_API_BASE_URL}${path}`;
  if (!query) return url;
  const search = new URLSearchParams(query).toString();
  return search ? `${url}?${search}` : url;
}

function failureFromResponse(response: Response): ElevenLabsFailure {
  const kind: ElevenLabsFailureKind =
    response.status === 401
      ? "unauthorized"
      : response.status === 429
        ? "rate_limited"
        : "http_error";

  return {
    ok: false,
    kind,
    status: response.status,
    statusText: response.statusText,
    message: `ElevenLabs returned HTTP ${response.status}${
      response.statusText ? ` ${response.statusText}` : ""
    }.`,
  };
}

function failureFromThrown(error: unknown, timeoutMs: number): ElevenLabsFailure {
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return {
      ok: false,
      kind: "timeout",
      status: 0,
      statusText: "",
      message: `The request to ElevenLabs timed out after ${timeoutMs}ms.`,
    };
  }

  return {
    ok: false,
    kind: "network",
    status: 0,
    statusText: "",
    message:
      error instanceof Error
        ? `Could not reach ElevenLabs: ${error.message}`
        : "Could not reach ElevenLabs.",
  };
}

/**
 * Performs an ElevenLabs request and returns the raw `Response` on success.
 * Never throws and never rejects: transport failures come back as a typed
 * failure. Use this when only the status matters (e.g. key verification).
 */
export async function sendElevenLabsRequest(
  options: ElevenLabsRequestOptions,
): Promise<ElevenLabsResult<Response>> {
  const timeoutMs = options.timeoutMs ?? ELEVENLABS_REQUEST_TIMEOUT_MS;

  let response: Response;
  try {
    response = await fetch(buildElevenLabsUrl(options.path, options.query), {
      method: options.method ?? "GET",
      headers: { "xi-api-key": options.apiKey, ...(options.body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return failureFromThrown(error, timeoutMs);
  }

  if (!response.ok) return failureFromResponse(response);

  return { ok: true, status: response.status, data: response };
}

/**
 * Same as {@link sendElevenLabsRequest}, but decodes a JSON body on success.
 * An unreadable body becomes an `invalid_response` failure rather than a throw.
 */
export async function fetchElevenLabsJson<T>(
  options: ElevenLabsRequestOptions,
): Promise<ElevenLabsResult<T>> {
  const result = await sendElevenLabsRequest(options);
  if (!result.ok) return result;

  try {
    const data = (await result.data.json()) as T;
    return { ok: true, status: result.status, data };
  } catch {
    return {
      ok: false,
      kind: "invalid_response",
      status: result.status,
      statusText: result.data.statusText,
      message: `ElevenLabs returned HTTP ${result.status} with a body that could not be parsed as JSON.`,
    };
  }
}
