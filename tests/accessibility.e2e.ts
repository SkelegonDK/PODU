import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { setupApiMocks } from "./helpers/api-mocks";

async function checkAccessibility(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      targets: nodes.map((node) => node.target),
    })),
  ).toEqual([]);
}

test("public and account preview pages pass automated accessibility checks", async ({
  page,
}) => {
  for (const path of ["/welcome", "/sign-up", "/sign-in"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await checkAccessibility(page);
  }
});

test("workspace, dialogs and conversation controls pass automated accessibility checks", async ({
  page,
}) => {
  await setupApiMocks(page, { agentsDelay: 0 });
  await page.goto("/");
  await expect(page.getByTestId("play-button")).toBeVisible();
  await checkAccessibility(page);
  await page.getByRole("button", { name: "API settings" }).click();
  await expect(page.getByRole("dialog")).toHaveCSS("opacity", "1");
  await checkAccessibility(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeAttached();
  await page.getByRole("button", { name: /upload document/i }).click();
  await expect(page.getByRole("dialog")).toHaveCSS("opacity", "1");
  await checkAccessibility(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeAttached();
  await page.getByRole("button", { name: /technology/i }).click();
  await page.getByTestId("play-button").click();
  await expect(page.getByTestId("conversation-mode-badge")).toBeVisible();
  await checkAccessibility(page);
});
