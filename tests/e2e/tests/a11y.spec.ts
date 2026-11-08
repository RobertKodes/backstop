import AxeBuilder from "@axe-core/playwright";

import { D, expect, test } from "../fixtures/mock";

const PAGES = [
  "/",
  `/offers/${D.A.offer1}`,
  "/sell",
  "/chest",
  "/shield",
  "/treasury",
  "/leaderboards",
  "/launchpad",
  `/launchpad/${D.A.child1}`,
  "/agent",
];

async function scan(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes
          .map((n) => n.target.join(" "))
          .slice(0, 5)
          .join("\n  ")}`,
    );
}

test.describe("Accessibility (axe)", () => {
  test.use({ connected: true });

  for (const path of PAGES) {
    test(`no serious or critical violations on ${path.length > 30 ? `${path.slice(0, 30)}…` : path}`, async ({
      page,
    }) => {
      for (const theme of ["light", "dark"] as const) {
        await page.addInitScript((t) => localStorage.setItem("backstop-theme", t), theme);
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator("main [aria-busy='true']")).toHaveCount(0);
        // Let content settle (charts measure, fonts load).
        await page.waitForLoadState("networkidle").catch(() => {});
        const violations = await scan(page);
        expect(violations, `${theme} theme:\n${violations.join("\n")}`).toEqual([]);
      }
    });
  }

  test("disconnected pages and the wallet dialog", async ({ page, context }) => {
    await context.clearCookies();
    await page.addInitScript(() => localStorage.removeItem("walletName"));
    await page.goto("/chest");
    await expect(page.getByTestId("connect-prompt")).toBeVisible();
    expect(await scan(page)).toEqual([]);
    await page.getByTestId("connect-wallet").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await scan(page)).toEqual([]);
  });
});
