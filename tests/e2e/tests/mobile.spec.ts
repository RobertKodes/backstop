import { D, expect, test } from "../fixtures/mock";

for (const path of ["/", `/offers/${D.A.offer1}`, "/sell", "/chest", "/leaderboards", "/launchpad"]) {
  test(`no horizontal page scroll on ${path.slice(0, 24)} at phone width`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await page.waitForLoadState("networkidle").catch(() => {});
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole("navigation", { name: "Main (compact)" })).toBeVisible();
  });
}

test("live board stays usable on a phone", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("offer-row")).toHaveCount(2);
  await expect(page.getByTestId("offer-row").first().getByTestId("countdown")).toBeVisible();
  await page.getByTestId("offer-row").first().getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/offers/${D.A.offer2}`));
});
