import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Opt-in checks use an existing development Clerk instance. They do not submit
// credentials, create users, send verification messages, or call ElevenLabs.
const liveAuthUrl = process.env.PODU_LIVE_AUTH_URL;
test.skip(
  !liveAuthUrl,
  "Set PODU_LIVE_AUTH_URL to a running Clerk-enabled preview.",
);

test("real Clerk forms load, fit on a phone, and pass accessibility checks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/sign-up", "/sign-in"]) {
    await page.goto(`${liveAuthUrl}${path}`);
    await expect(
      page.getByRole("button", { name: "Continue", exact: true }),
    ).toBeVisible({ timeout: 20000 });
    const identifier = page.getByLabel(
      path === "/sign-up" ? "Email address" : "Email address or username",
      { exact: true },
    );
    await expect(identifier).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      violations.map(({ id, nodes }) => ({
        id,
        targets: nodes.map((node) => ({
          target: node.target,
          failure: node.failureSummary,
        })),
      })),
    ).toEqual([]);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const firstField = page.locator("input:visible").first();
    await expect(firstField).toBeFocused();
  }
});
