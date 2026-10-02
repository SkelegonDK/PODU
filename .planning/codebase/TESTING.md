# Testing Patterns

**Analysis Date:** 2026-04-21

## Test Framework

**Runners:**
- **Bun test** (`bun:test`) for unit tests — built-in, no config file required
- **Playwright** `@playwright/test` ^1.48.0 for end-to-end browser tests
  - Config: `playwright.config.ts`

**Assertion Libraries:**
- `expect` from `bun:test` for unit tests (Jest-compatible API)
- `expect` from `@playwright/test` for e2e tests

**Run Commands (from `package.json`):**
```bash
bun test                      # Run all bun tests
bun run test:unit             # Run unit tests under src/ only (bun test src/)
bun run test:e2e              # Run Playwright tests headless (bunx playwright test)
bun run test:e2e:ui           # Playwright UI mode
bun run test:e2e:install      # Install Playwright browsers with deps
```

No `--coverage` script defined.

## Test File Organization

**Locations:**
- Unit tests co-located with source under `__tests__/` subfolders — `src/api/__tests__/`
- E2E tests in dedicated top-level `tests/` directory

**Naming:**
- Unit: `<module>.test.ts` — `agents.test.ts`, `knowledgebase.test.ts`, `agentPrompts.test.ts`, `auditAgents.test.ts`
- E2E: `<feature>.spec.ts` — `upload-dialog.spec.ts`, `start-conversation.spec.ts`, `mode-selection.spec.ts`, `upload-dialog-error.spec.ts`, `start-conversation-error.spec.ts`

**Structure:**
```
src/api/__tests__/            # Unit tests for backend API modules
  agents.test.ts
  knowledgebase.test.ts
  agentPrompts.test.ts
  auditAgents.test.ts

tests/                        # Playwright e2e suite
  fixtures/
    test-document.txt         # Static test asset
  helpers/
    api-mocks.ts              # Route-interception helpers
  *.spec.ts
```

## Test Structure

**Suite Organization (unit, bun:test):**
```typescript
import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
import { getAgentForMode, buildFullPrompt } from "../agents";

beforeEach(() => {
  process.env.ELEVENLABS_AGENT_ID_FUN = "agent_fun_123";
  process.env.ELEVENLABS_API_KEY = "test_api_key";
});

describe("buildFullPrompt", () => {
  it("includes base system prompt for each mode", () => {
    const prompt = buildFullPrompt("fun", []);
    expect(prompt).toContain("PODU");
  });
});
```

**Suite Organization (e2e, Playwright):**
```typescript
import { test, expect } from "@playwright/test";
import { setupApiMocks } from "./helpers/api-mocks";

test.describe("Upload Dialog Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page, { uploadDelay: 800, deleteDelay: 300 });
    await page.goto("/");
  });

  test("should open upload dialog when clicking upload subject", async ({ page }) => {
    await page.getByRole("button", { name: /upload document/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});
```

**Patterns:**
- `describe` blocks group by function/feature under test
- `beforeEach` used for env-var reset (unit) and route mocking + navigation (e2e)
- Assertions chained on `expect(value)` with matchers `.toBe`, `.toEqual`, `.toContain`, `.toStartWith`, `.toBeTruthy`, `.rejects.toThrow`
- E2E selectors prefer accessible roles and regex name matches — `page.getByRole("button", { name: /upload document/i })`

## Mocking

**Unit tests (`bun:test`):**
- `spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(...))` to stub HTTP calls — see `src/api/__tests__/agents.test.ts` (`getConversationToken` tests)
- Always call `mockFetch.mockRestore()` after assertions
- Env vars mutated directly: `process.env.ELEVENLABS_API_KEY = "test_api_key"` and `delete process.env.X` to simulate missing config
- Dynamic `import()` inside tests for cross-module setup/teardown — e.g. `const { uploadDocument } = await import("../knowledgebase")`

**E2E tests (Playwright):**
- Route interception via `page.route(pattern, handler)` in `tests/helpers/api-mocks.ts`
- Shared mock setup helpers: `setupApiMocks`, `mockDocumentsDeleteApi` (parameterised with delays to simulate latency)
- File uploads simulated with in-memory buffers via `fileInput.setInputFiles({ name, mimeType, buffer })`

**What to Mock:**
- Outbound HTTP (ElevenLabs API) in unit tests
- All `/api/*` routes in e2e tests so they run without backend dependencies

**What NOT to Mock:**
- Internal pure functions (`buildFullPrompt`, `resolveSubjectNames`) — tested directly
- In-memory knowledgebase store — tests exercise real `uploadDocument` / `deleteDocument` and clean up in `beforeEach`

## Fixtures and Factories

**Test Data:**
- Inline object literals for most inputs — `{ name: "test.txt", content: "Hello world" }`
- Playwright buffer fixtures — `Buffer.from("Test content")`
- Static fixture file: `tests/fixtures/test-document.txt`

**Location:**
- No shared factories; fixtures colocated with the test that uses them or in `tests/fixtures/`

## Coverage

**Requirements:** None enforced

**View Coverage:**
- Not configured; no `--coverage` flag in scripts and no threshold file

## Test Types

**Unit Tests:**
- Scope: backend API logic in `src/api/` — prompt assembly, env-driven agent selection, document store, audit CLI helpers
- Approach: direct imports, real in-memory state, mocked outbound HTTP

**Integration Tests:**
- Not separated as a distinct tier; Playwright e2e tests serve this role by hitting the live Bun server with mocked third-party APIs

**E2E Tests:**
- Framework: Playwright, three projects configured — `chromium`, `webkit`, `mobile` (iPhone 14 device profile)
- `baseURL`: `http://127.0.0.1:3000`
- `webServer`: auto-starts `PORT=3000 bun --hot src/index.ts`, health-checks `/api/health`, 120s timeout, reuses existing server locally
- Artifacts: `trace: "on-first-retry"`, `screenshot: "only-on-failure"`, `video: "retain-on-failure"`
- Reporter: `html` (output to `playwright-report/`)
- Results directory: `test-results/`

**CI Behavior (from `playwright.config.ts`):**
- `forbidOnly: !!process.env.CI` — fails if `test.only` is committed
- `retries: process.env.CI ? 2 : 0`
- `workers: process.env.CI ? 1 : undefined`
- `reuseExistingServer: !process.env.CI`
- No CI workflow file detected in repo (no `.github/workflows/`)

## Common Patterns

**Async Testing:**
```typescript
it("returns correct agent ID for fun mode", async () => {
  const result = await getAgentForMode({ mode: "fun", subjects: [] });
  expect(result.agentId).toBe(process.env.ELEVENLABS_AGENT_ID_FUN!);
});
```

**Error Testing:**
```typescript
it("throws for unconfigured mode", async () => {
  delete process.env.ELEVENLABS_AGENT_ID_FUN;
  await expect(getAgentForMode({ mode: "fun", subjects: [] })).rejects.toThrow(
    "No agent ID configured for mode: fun"
  );
});
```

**Fetch Mocking:**
```typescript
const mockFetch = spyOn(globalThis, "fetch").mockResolvedValueOnce(
  new Response(JSON.stringify({ token: "test_token_123" }), { status: 200 })
);
// ... exercise code ...
expect(mockFetch).toHaveBeenCalledWith(url, init);
mockFetch.mockRestore();
```

**E2E File Upload:**
```typescript
const fileInput = page.locator('input[type="file"]');
await fileInput.setInputFiles({
  name: "test-document.txt",
  mimeType: "text/plain",
  buffer: Buffer.from("Test document content"),
});
await expect(page.getByText("test-document.txt")).toBeVisible({ timeout: 1500 });
```

**Mobile-conditional tests:**
```typescript
test("should handle touch interactions", async ({ page, isMobile }) => {
  test.skip(!isMobile, "This test is for mobile devices only");
  await page.getByRole("button", { name: /upload document/i }).tap();
});
```

## Coverage Gaps (observed)

- No unit tests for frontend React components (`src/components/`) — all component behaviour validated only through Playwright
- No unit tests for `src/lib/authFetch.ts`, `src/lib/utils.ts`
- No tests for Vercel serverless handlers under `api/` (`api/agents/[agentId]/index.ts`, `api/documents/*`, `api/usage/*`, `api/webhooks/*`)
- No tests for Convex functions in `convex/` (`conversations.ts`, `users.ts`)
- No test for the main Bun server entrypoint `src/index.ts`
- No CI pipeline configured to run tests automatically

---

*Testing analysis: 2026-04-21*
