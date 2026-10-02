import { afterEach, describe, expect, mock, test } from "bun:test";
import { configureAccessToken, getConfig, getAgent } from "../poduApi";
import { failureCopyFromApiError } from "../failureCopy";

const originalFetch = globalThis.fetch;
let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  globalThis.fetch = originalFetch;
});

describe("Clerk API session handoff", () => {
  test("refreshes the bearer token for each request and preserves JSON headers", async () => {
    const requests: Headers[] = [];
    let tokenNumber = 0;
    cleanup = configureAccessToken(async () => `session-${++tokenNumber}`);
    globalThis.fetch = mock(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Headers(init?.headers));
        return Response.json({});
      },
    ) as unknown as typeof fetch;
    await getConfig();
    await getAgent("fun", ["tech"]);
    expect(requests[0]?.get("Authorization")).toBe("Bearer session-1");
    expect(requests[1]?.get("Authorization")).toBe("Bearer session-2");
    expect(requests[1]?.get("Content-Type")).toBe("application/json");
  });

  test("does not send a request when the active session has expired", async () => {
    cleanup = configureAccessToken(async () => null);
    const fetchMock = mock(async () => Response.json({}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const result = await getConfig();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(failureCopyFromApiError(result.error, "landing").action).toBe(
        "sign_in",
      );
  });

  test("allows local requests again after the Clerk workspace unmounts", async () => {
    const headers: Headers[] = [];
    cleanup = configureAccessToken(async () => "session-token");
    cleanup();
    globalThis.fetch = mock(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        headers.push(new Headers(init?.headers));
        return Response.json({});
      },
    ) as unknown as typeof fetch;
    expect((await getConfig()).ok).toBe(true);
    expect(headers[0]?.has("Authorization")).toBe(false);
  });

  test("maps a failed token refresh to a sign-in action", async () => {
    cleanup = configureAccessToken(async () => {
      throw new Error("Session unavailable");
    });
    const result = await getConfig();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(401);
  });
});
