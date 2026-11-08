import { expect, test } from "../fixtures/mock";

test.describe("My Chest (disconnected)", () => {
  test("always shows the time lock and penalty, and prompts to connect", async ({ page }) => {
    await page.goto("/chest");
    const terms = page.getByTestId("chest-lock-terms");
    await expect(terms).toContainText("Withdrawals are time-locked.");
    await expect(terms).toContainText("60-day rolling lock");
    await expect(terms).toContainText("25% penalty");
    await expect(page.getByTestId("connect-prompt")).toBeVisible();
    await page.getByTestId("connect-prompt").getByRole("button", { name: "Connect wallet" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});

test.describe("My Chest (wallet connected)", () => {
  test.use({ connected: true });

  test("shows balance, variable yield, lock status and history", async ({ page }) => {
    await page.goto("/chest");
    const summary = page.getByTestId("chest-summary");
    await expect(summary).toContainText("1,500");
    await expect(summary).toContainText("Variable yield (estimated)");
    await expect(page.getByTestId("lock-status")).toContainText("Locked");
    await expect(page.getByTestId("lock-status")).toContainText("Early withdrawal penalty: 25%");
    await expect(page.getByTestId("chest-lock-terms")).toBeVisible();
    await expect(page.getByTestId("chest-history").locator("tbody tr")).toHaveCount(3);
  });

  test("previews the early-withdrawal penalty", async ({ page }) => {
    await page.goto("/chest");
    const form = page.getByTestId("withdraw-form");
    await form.getByLabel("Amount (USDC)").fill("100");
    const preview = form.getByTestId("withdraw-preview");
    await expect(preview).toContainText("Penalty25 USDC");
    await expect(preview).toContainText("You receive75 USDC");
    await form.getByRole("button", { name: "Withdraw early" }).click();
    await expect(form.getByTestId("field-error")).toContainText("Confirm the early-withdrawal penalty");
  });

  test("validates Auto-Absorb settings", async ({ page }) => {
    await page.goto("/chest");
    const auto = page.getByTestId("auto-absorb");
    await expect(page.getByTestId("grant-max-offer")).toHaveValue("250");
    await expect(page.getByTestId("grant-max-day")).toHaveValue("1000");

    await page.getByTestId("grant-max-day").fill("100");
    await page.getByTestId("grant-min-discount").fill("15");
    await page.getByTestId("grant-reserve").fill("abc");
    await page.getByTestId("grant-save").click();
    await expect(auto.getByTestId("grant-errors")).toBeVisible();
    await expect(auto).toContainText("Max per day must be at least the max per offer.");
    await expect(auto).toContainText("Offers never exceed a 12% discount");
    await expect(auto).toContainText("Enter an amount, or 0 for no reserve.");
    await expect(page.getByTestId("grant-max-day")).toHaveAttribute("aria-invalid", "true");

    await page.getByTestId("grant-max-day").fill("1000");
    await page.getByTestId("grant-min-discount").fill("4.5");
    await page.getByTestId("grant-reserve").fill("0");
    await expect(auto.getByTestId("field-error")).toHaveCount(0);
    await expect(auto.getByRole("button", { name: "Revoke" })).toBeVisible();
  });
});

test.describe("Shield", () => {
  test("shows per-offer cap, priority slice and a variable APR estimate", async ({ page }) => {
    await page.goto("/shield");
    const facts = page.getByTestId("shield-facts");
    await expect(facts).toContainText("10,000 USDC");
    await expect(facts).toContainText("Up to 50%");
    await expect(facts).toContainText("450K USDC");
    await expect(page.getByTestId("shield-apr")).toContainText("Fee APR (variable, estimated)");
    await expect(page.getByTestId("shield-apr")).toContainText("%");
    await expect(page.getByTestId("connect-prompt")).toBeVisible();
  });
});

test.describe("Shield (wallet connected)", () => {
  test.use({ connected: true });

  test("validates the lock form and previews the multiplier", async ({ page }) => {
    await page.goto("/shield");
    const form = page.getByTestId("shield-lock-form");
    await page.getByTestId("shield-submit").click();
    await expect(form).toContainText("Enter an amount greater than 0.");

    await page.getByTestId("shield-amount").fill("2000");
    await expect(form).toContainText("That is more than your chest balance.");
    await page.getByTestId("shield-amount").fill("500");

    await page.getByTestId("shield-days").fill("10");
    await expect(form).toContainText("Locks must be at least 30 days.");
    await expect(page.getByTestId("shield-multiplier")).toHaveText("–");

    await page.getByTestId("shield-days").fill("60");
    await expect(page.getByTestId("shield-multiplier")).toHaveText("2×");
    await page.getByTestId("shield-days").fill("400");
    await expect(page.getByTestId("shield-multiplier")).toHaveText("12×");
    await expect(form.getByTestId("field-error")).toHaveCount(0);
  });

  test("lists positions with claim and lock-gated withdraw", async ({ page }) => {
    await page.goto("/shield");
    const positions = page.getByTestId("shield-positions");
    await expect(positions).toContainText("1,000 USDC");
    await expect(positions).toContainText("2×");
    await expect(positions).toContainText("Locked until");
    await expect(positions.getByRole("button", { name: "Claim gains" })).toBeEnabled();
    await expect(positions.getByRole("button", { name: "Withdraw to chest" })).toHaveAttribute("aria-disabled", "true");
  });
});
