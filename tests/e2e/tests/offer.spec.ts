import { D, expect, test } from "../fixtures/mock";

const OFFER = `/offers/${D.A.offer1}`;

test.describe("Offer page", () => {
  test("shows countdown, discount, fill price, bids and the no-cancel terms", async ({ page }) => {
    await page.goto(OFFER);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Offer No. 42");
    await expect(page.getByTestId("countdown")).toHaveText(/^0[67]:\d\d$/);
    await expect(page.getByTestId("frozen-discount")).toContainText("6.2%");
    await expect(page.getByText("0.0469")).toBeVisible();
    await expect(page.getByTestId("no-cancel")).toContainText("Offers cannot be cancelled.");
    await expect(page.getByTestId("allocation-explainer")).toContainText(
      "pro-rata share rounded up or down by at most one lot",
    );
    const bids = page.getByTestId("bids-table");
    await expect(bids.locator("tbody tr")).toHaveCount(3);
    await expect(bids).toContainText("Auto-Absorb");
    // Seller (truncated) is shown.
    await expect(page.getByText("Dqkx…Cigr")).toBeVisible();
  });

  test("masks profanity in the seller's message", async ({ page }) => {
    await page.goto(OFFER);
    const msg = page.getByTestId("seller-message");
    await expect(msg).toContainText("selling this s*** to pay rent");
    await expect(msg).not.toContainText("sh1t");
  });

  test("offers chest, fresh USDC or both as the bid source", async ({ page }) => {
    await page.goto(OFFER);
    const form = page.getByTestId("absorb-form");
    const source = form.getByTestId("absorb-source");
    await expect(source.getByLabel("Chest")).toBeChecked();
    await expect(form.getByLabel("From chest")).toBeVisible();
    await expect(form.getByLabel("From wallet")).toHaveCount(0);

    await source.getByText("Fresh USDC").click();
    await expect(form.getByLabel("From wallet")).toBeVisible();
    await expect(form.getByLabel("From chest")).toHaveCount(0);

    await source.getByText("Both").click();
    await expect(form.getByLabel("From chest")).toBeVisible();
    await expect(form.getByLabel("From wallet")).toBeVisible();
    await expect(form).toContainText("one chest bid and one wallet bid in a single transaction");
  });

  test("disconnected visitors are asked to connect a wallet", async ({ page }) => {
    await page.goto(OFFER);
    const submit = page.getByTestId("absorb-submit");
    await expect(submit).toHaveText("Connect wallet to absorb");
    await submit.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText("Phantom");
  });
});

test.describe("Offer page (wallet connected)", () => {
  test.use({ connected: true });

  test("computes whole lots and validates the bid", async ({ page }) => {
    await page.goto(OFFER);
    await expect(page.getByTestId("wallet-menu")).toContainText("YXAq…PBmn");
    const form = page.getByTestId("absorb-form");
    await expect(form).toContainText("Chest balance: 1,500 USDC");

    await form.getByLabel("From chest").fill("100");
    await expect(form.getByTestId("field-error")).toContainText("one lot costs 234.5 USDC");

    await form.getByLabel("From chest").fill("2000");
    await expect(form.getByTestId("field-error")).toContainText("more than your chest balance");

    await form.getByLabel("From chest").fill("500");
    await expect(form.getByTestId("field-error")).toHaveCount(0);
    await expect(form).toContainText("Lots bid2");
    await expect(form).toContainText("469 USDC");
    await expect(form).toContainText("10K BACKSTOP");
    await expect(page.getByTestId("absorb-submit")).toHaveText("Absorb 2 lots");
  });

  test("a rejected signature surfaces as an error toast", async ({ page }) => {
    await page.goto(OFFER);
    const form = page.getByTestId("absorb-form");
    await form.getByLabel("From chest").fill("500");
    await page.getByTestId("absorb-submit").click();
    const toast = page.getByTestId("toast").last();
    await expect(toast).toContainText("Placing bid did not complete");
  });
});
