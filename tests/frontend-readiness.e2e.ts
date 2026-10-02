import { test, expect } from "@playwright/test";
import {
  mockConfigApi,
  mockAgentsApi,
  mockConversationTokenApi,
  mockDocumentsDeleteApi,
  setupApiMocks,
} from "./helpers/api-mocks";

test("first-time visitors can explore without a blocking API-key dialog", async ({
  page,
}) => {
  await mockConfigApi(page, { hasApiKey: false, apiKeySource: "none" });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /follow a thought/i }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: /technology/i }).click();
  await expect(page.getByTestId("play-button")).toBeDisabled();
  await page.getByRole("button", { name: "Open Settings" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("topic selection communicates its limit and allows a different choice", async ({
  page,
}) => {
  await setupApiMocks(page);
  await page.goto("/");
  for (const name of [/technology/i, /science/i, /history/i])
    await page.getByRole("button", { name }).click();
  await expect(
    page.getByRole("button", { name: /philosophy/i }),
  ).toBeDisabled();
  await expect(
    page.getByText("Three topics selected. Deselect one to try another."),
  ).toBeVisible();
  const technology = page.getByRole("button", { name: /technology/i });
  await expect(technology).toHaveAttribute("aria-pressed", "true");
  await technology.click();
  await page.getByRole("button", { name: /philosophy/i }).click();
  await expect(
    page.getByRole("button", { name: /philosophy/i }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("welcome and account preview pages fit a narrow phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  for (const path of ["/welcome", "/sign-up", "/sign-in"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await expect(
    page.getByRole("link", { name: "Explore PODU" }),
  ).toHaveAttribute("href", "/app");
});

test("keyboard users can open the file picker", async ({ page }) => {
  await setupApiMocks(page);
  await page.goto("/");
  await page.getByRole("button", { name: /upload document/i }).click();
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Choose documents to upload" })
    .focus();
  await page.keyboard.press("Enter");
  await (
    await chooser
  ).setFiles({
    name: "keyboard-notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("A thought to explore"),
  });
  await expect(page.getByText("keyboard-notes.txt")).toBeVisible();
});

test("failed document removal can be retried against the server", async ({
  page,
}) => {
  await setupApiMocks(page, { uploadDelay: 0 });
  await page.goto("/");
  await page.getByRole("button", { name: /upload document/i }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "retry-notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Some thoughts"),
  });
  const remove = page.getByRole("button", { name: "Remove retry-notes.txt" });
  await expect(remove).toBeEnabled();
  await mockDocumentsDeleteApi(page, {
    status: 500,
    body: { error: "Please try again" },
  });
  await remove.click();
  await expect(page.getByText(/Couldn't remove this file/)).toBeVisible();
  let deleted = false;
  await page.route("**/api/documents/*", async (route) => {
    deleted = true;
    await route.fulfill({ json: { success: true } });
  });
  await remove.click();
  await expect(page.getByText("retry-notes.txt")).not.toBeVisible();
  await expect.poll(() => deleted).toBe(true);
});

test("permission-check microphone tracks stop when token retrieval fails", async ({
  page,
}) => {
  await setupApiMocks(page, { agentsDelay: 0 });
  await mockAgentsApi(page, {
    body: {
      agentId: "test-agent-123",
      conversationId: "saved-conversation",
      systemPrompt: "Explore ideas.",
      firstMessage: "Welcome.",
    },
  });
  const tokenRequest = page.waitForRequest((request) =>
    new URL(request.url()).pathname.endsWith("/conversation-token"),
  );
  await mockConversationTokenApi(page, {
    status: 503,
    body: { error: "Please try again", code: "upstream_error" },
  });
  await page.addInitScript(() => {
    const state = window as unknown as Window & { stoppedTracks: number };
    state.stoppedTracks = 0;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => ({
          getAudioTracks: () => [
            { kind: "audio", getSettings: () => ({ sampleRate: 48000 }) },
          ],
          getTracks: () => [
            {
              stop: () => {
                state.stoppedTracks++;
              },
            },
          ],
        }),
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /technology/i }).click();
  await page.getByTestId("play-button").click();
  await expect(page.getByTestId("conversation-mode-badge")).toBeVisible();
  await page.getByTestId("play-button").click();
  await expect(page.getByRole("alert")).toContainText("Please try again");
  expect(
    new URL((await tokenRequest).url()).searchParams.get("conversationId"),
  ).toBe("saved-conversation");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as Window & { stoppedTracks: number }).stoppedTracks,
    ),
  ).toBe(1);
  await page.getByRole("button", { name: "Leave conversation" }).click();
  await expect(page.getByTestId("play-button")).toBeFocused();
});

test("settings supports Enter submission with an associated error", async ({
  page,
}) => {
  await mockConfigApi(page, { hasApiKey: false });
  await page.route("**/api/config", async (route) => {
    if (route.request().method() === "POST")
      await route.fulfill({
        status: 401,
        json: {
          error: "This key could not be verified.",
          code: "invalid_api_key",
        },
      });
    else await route.fallback();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "API settings" }).click();
  const input = page.getByLabel("Paste your ElevenLabs API key");
  await input.fill("test-key");
  await input.press("Enter");
  await expect(page.getByRole("alert")).toContainText(
    "This key could not be verified.",
  );
  await expect(input).toHaveAttribute("aria-invalid", "true");
});
