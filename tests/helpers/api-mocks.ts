import type { Page, Route } from "@playwright/test";

/**
 * Helper to mock API routes with controllable latency
 */
export interface MockApiOptions {
  delay?: number; // Delay in milliseconds
  status?: number;
  body?: any;
}

/**
 * Helper to mock error responses with a realistic { error, code } body.
 * Mirrors the shape the real server returns for ConfigError (see src/index.ts
 * configErrorResponse and src/api/agents.ts ConfigError).
 */
export interface MockApiErrorOptions {
  delay?: number;
  status?: number;
  error?: string;
  code?:
    | "missing_api_key"
    | "invalid_api_key"
    | "missing_agent_id"
    | "upstream_error"
    | string;
}

/**
 * Mock the /api/agents POST endpoint
 */
export async function mockAgentsApi(
  page: Page,
  options: MockApiOptions = {},
): Promise<void> {
  const {
    delay = 0,
    status = 200,
    body = {
      agentId: "test-agent-123",
      systemPrompt: "You are the host of PODU, an interactive podcast.",
      firstMessage: "Welcome to PODU! What would you like to talk about?",
    },
  } = options;

  await page.route("**/api/agents", async (route: Route) => {
    if (route.request().method() === "POST") {
      await new Promise((resolve) => setTimeout(resolve, delay));
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    } else {
      await route.fallback();
    }
  });
}

/**
 * Mock the /api/agents POST endpoint with a realistic { error, code } error body.
 */
export async function mockAgentsApiError(
  page: Page,
  options: MockApiErrorOptions = {},
): Promise<void> {
  const {
    delay = 0,
    status = 500,
    error = "Failed to get agent",
    code = "upstream_error",
  } = options;

  await mockAgentsApi(page, { delay, status, body: { error, code } });
}

/**
 * Mock the /api/agents/:agentId/conversation-token GET endpoint (WebRTC)
 */
export async function mockConversationTokenApi(
  page: Page,
  options: MockApiOptions = {},
): Promise<void> {
  const {
    delay = 0,
    status = 200,
    body = { token: "test-conversation-token" },
  } = options;

  await page.route(
    "**/api/agents/*/conversation-token*",
    async (route: Route) => {
      if (route.request().method() === "GET") {
        await new Promise((resolve) => setTimeout(resolve, delay));
        await route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      } else {
        await route.fallback();
      }
    },
  );
}

/**
 * Mock the GET /api/config endpoint. Gates the entire app (LandingPage.tsx
 * handleStart pre-flights this before /api/agents, and canStart disables the
 * play button unless hasApiKey && agentIds[mode]), so it must be mocked in
 * every e2e test that reaches the start-conversation flow. Defaults to a
 * fully-configured state so tests don't depend on the developer's real .env.
 *
 * Shape mirrors ConfigStatus in src/api/config.ts:10-16.
 */
export interface ConfigStatusOverrides {
  hasApiKey?: boolean;
  apiKeySource?: "session" | "env" | "none";
  apiKeyPreview?: string | null;
  agentIds?: Partial<{ fun: boolean; edu: boolean; deep: boolean }>;
  missingAgentModes?: Array<"fun" | "edu" | "deep">;
}

export async function mockConfigApi(
  page: Page,
  overrides: ConfigStatusOverrides = {},
  options: Pick<MockApiOptions, "delay" | "status"> = {},
): Promise<void> {
  const { delay = 0, status = 200 } = options;

  const { agentIds: agentIdOverrides, ...restOverrides } = overrides;
  const body = {
    hasApiKey: true,
    apiKeySource: "session" as const,
    apiKeyPreview: "test…key1",
    missingAgentModes: [] as Array<"fun" | "edu" | "deep">,
    ...restOverrides,
    agentIds: {
      fun: true,
      edu: true,
      deep: true,
      ...agentIdOverrides,
    },
  };

  await page.route("**/api/config", async (route: Route) => {
    if (route.request().method() === "GET") {
      await new Promise((resolve) => setTimeout(resolve, delay));
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    } else {
      await route.fallback();
    }
  });
}

/**
 * Mock the /api/documents POST endpoint (file upload)
 */
export async function mockDocumentsUploadApi(
  page: Page,
  options: MockApiOptions = {},
): Promise<void> {
  const {
    delay = 0,
    status = 200,
    body = {
      id: `doc-${Date.now()}`,
      name: "test-document.txt",
      uploadedAt: new Date().toISOString(),
    },
  } = options;

  await page.route("**/api/documents", async (route: Route) => {
    if (route.request().method() === "POST") {
      await new Promise((resolve) => setTimeout(resolve, delay));
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    } else {
      await route.fallback();
    }
  });
}

/**
 * Mock the /api/documents/:id DELETE endpoint
 */
export async function mockDocumentsDeleteApi(
  page: Page,
  options: MockApiOptions = {},
): Promise<void> {
  const { delay = 0, status = 200, body = { success: true } } = options;

  await page.route("**/api/documents/*", async (route: Route) => {
    if (route.request().method() === "DELETE") {
      await new Promise((resolve) => setTimeout(resolve, delay));
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    } else {
      await route.fallback();
    }
  });
}

/**
 * Mock the /api/documents GET endpoint (list documents)
 */
export async function mockDocumentsListApi(
  page: Page,
  options: MockApiOptions = {},
): Promise<void> {
  const { delay = 0, status = 200, body = { documents: [] } } = options;

  await page.route("**/api/documents", async (route: Route) => {
    if (route.request().method() === "GET") {
      await new Promise((resolve) => setTimeout(resolve, delay));
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    } else {
      await route.fallback();
    }
  });
}

/**
 * Setup all API mocks with default latency
 */
export async function setupApiMocks(
  page: Page,
  options: {
    agentsDelay?: number;
    conversationTokenDelay?: number;
    uploadDelay?: number;
    deleteDelay?: number;
    config?: ConfigStatusOverrides;
  } = {},
): Promise<void> {
  await mockConfigApi(page, options.config);
  await mockAgentsApi(page, { delay: options.agentsDelay ?? 1200 });
  await mockConversationTokenApi(page, {
    delay: options.conversationTokenDelay ?? 0,
  });
  await mockDocumentsUploadApi(page, { delay: options.uploadDelay ?? 800 });
  await mockDocumentsDeleteApi(page, { delay: options.deleteDelay ?? 300 });
  await mockDocumentsListApi(page);
}
