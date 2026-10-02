import { ConfigError } from "../api/agents";
import { authorize, HttpError } from "./backend";

/**
 * Maps a ConfigError's code to the HTTP status the client should see.
 * Shared by every /api/* route so the mapping only lives in one place.
 */
function configErrorResponse(err: ConfigError): Response {
  const statusMap = {
    missing_api_key: 401,
    invalid_api_key: 401,
    missing_agent_id: 500,
    upstream_error: 502,
  } as const;
  return Response.json({ error: err.message, code: err.code }, { status: statusMap[err.code] });
}

type RouteHandler<Path extends string> = (
  req: Bun.BunRequest<Path>,
) => Promise<unknown> | unknown;

/**
 * Wraps a Bun.serve route handler with consistent error handling:
 * - ConfigError is mapped to its documented status code via configErrorResponse.
 * - Any other thrown error is logged and turned into a safe, fixed-message 500
 *   (never leaks error.message to the client).
 * - A handler may return a Response directly (for custom status codes, e.g.
 *   404/400, or custom headers) or a plain value, which is JSON-serialized.
 *
 * `label` is used to build both the log line and the client-facing message,
 * e.g. route("get document", ...) logs "Failed to get document: <err>" and
 * responds with { error: "Failed to get document" } on unknown failures.
 */
export function route<Path extends string>(label: string, handler: RouteHandler<Path>, options: { public?: boolean } = {}) {
  return async (req: Bun.BunRequest<Path>): Promise<Response> => {
    try {
      if (!options.public) await authorize(req);
      const result = await handler(req);
      return result instanceof Response ? result : Response.json(result);
    } catch (error) {
      if (error instanceof HttpError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
      if (error instanceof ConfigError) return configErrorResponse(error);
      console.error(`Failed to ${label}:`, error);
      return Response.json({ error: `Failed to ${label}` }, { status: 500 });
    }
  };
}
