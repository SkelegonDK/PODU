import { test, expect } from "@playwright/test";
import { setupApiMocks } from "./helpers/api-mocks";

test.describe("Mode Selection", () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page, { agentsDelay: 200 });
    await page.goto("/");
  });

  test("should default to Fun mode", async ({ page }) => {
    const funButton = page.getByRole("button", { name: /fun/i });
    await expect(funButton).toHaveAttribute("aria-pressed", "true");
  });

  test("should switch between modes", async ({ page }) => {
    // Click FUN mode
    const funButton = page.getByRole("button", { name: /fun/i });
    await funButton.click();

    // Click DEEP mode
    const deepButton = page.getByRole("button", { name: /deep/i });
    await deepButton.click();

    // Click EDU mode
    const eduButton = page.getByRole("button", { name: /edu/i });
    await eduButton.click();
  });

  test("should show correct mode badge in conversation view", async ({
    page,
  }) => {
    // Select FUN mode
    await page.getByRole("button", { name: /fun/i }).click();

    // Select a subject to enable start
    await page.getByRole("button", { name: /technology/i }).click();

    // Start conversation
    await page.getByTestId("play-button").click();

    // Wait for conversation view with mode badge
    const modeBadge = page.getByTestId("conversation-mode-badge");
    await expect(modeBadge).toBeVisible({ timeout: 3000 });
    await expect(modeBadge).toHaveText("FUN");
  });

  test("should show EDU badge when EDU mode is selected", async ({ page }) => {
    await page.getByRole("button", { name: /edu/i }).click();
    await page.getByRole("button", { name: /science/i }).click();
    await page.getByTestId("play-button").click();

    const modeBadge = page.getByTestId("conversation-mode-badge");
    await expect(modeBadge).toBeVisible({ timeout: 3000 });
    await expect(modeBadge).toHaveText("EDU");
  });

  test("should show DEEP badge when DEEP mode is selected", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /deep/i }).click();
    await page.getByRole("button", { name: /philosophy/i }).click();
    await page.getByTestId("play-button").click();

    const modeBadge = page.getByTestId("conversation-mode-badge");
    await expect(modeBadge).toBeVisible({ timeout: 3000 });
    await expect(modeBadge).toHaveText("DEEP");
  });
});
