import { expect, test } from "../fixtures/mock";

test.describe("Sell flow", () => {
  test("explains the mechanic, warns about no-cancel and shows the Return Ticket before confirming", async ({
    page,
  }) => {
    await page.goto("/sell");
    const explainer = page.getByTestId("sell-explainer");
    await expect(explainer).toContainText("ten-minute public offer");
    await expect(explainer).toContainText("Fill price = TWAP × (1 − discount)");
    await expect(page.getByTestId("no-cancel-warning")).toContainText("Offers cannot be cancelled.");
    await expect(page.getByTestId("ticket-explainer")).toContainText(
      "buy back up to the amount holders absorbed with a 0% fee",
    );

    await page.getByTestId("sell-amount").fill("200000");
    const offer = page.getByTestId("path-offer");
    await expect(offer).toBeVisible();
    await expect(offer).toContainText("Ten-minute offer to holders");
    const est = page.getByTestId("sell-estimate");
    await expect(est).toContainText(/Discount \(frozen when posted\)about \d+(\.\d+)?%/);
    await expect(est).toContainText(/You receive if fully absorbed[\d,.]+ USDC/);
    await expect(est).toContainText(/If nobody bids \(all sold on the AMM\)[\d,.]+ USDC/);
    await expect(est).toContainText("Trade fee (3%)");
    await expect(page.getByTestId("return-ticket")).toContainText("within 7 days with a 0% fee");
    await expect(page.getByTestId("path-amm")).toHaveCount(0);
  });

  test("requires acknowledging that offers cannot be cancelled", async ({ page }) => {
    await page.goto("/sell");
    await page.getByTestId("sell-amount").fill("200000");
    // Disconnected: the button asks to connect first.
    await expect(page.getByTestId("sell-submit")).toHaveText("Connect wallet to sell");
    await page.getByTestId("sell-submit").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText("Confirm that you understand the offer cannot be cancelled.")).toBeVisible();
    await page.getByTestId("ack-no-cancel").check();
    await expect(page.getByText("Confirm that you understand the offer cannot be cancelled.")).toHaveCount(0);
  });

  test("small sells go straight to the AMM and are still taxed", async ({ page }) => {
    await page.goto("/sell");
    await page.getByTestId("sell-amount").fill("5000");
    const amm = page.getByTestId("path-amm");
    await expect(amm).toBeVisible();
    await expect(amm).toContainText("Direct AMM sale");
    await expect(amm).toContainText("below the minimum offer size");
    await expect(amm).toContainText("The 3% trade fee still applies");
    await expect(amm).toContainText(/Estimated proceeds2[\d,.]+ USDC/);
    await expect(page.getByTestId("path-offer")).toHaveCount(0);
    await expect(page.getByTestId("ack-no-cancel")).toHaveCount(0);
  });
});

test.describe("Sell flow (wallet connected)", () => {
  test.use({ connected: true });

  test("checks the wallet balance and lists Return Tickets", async ({ page }) => {
    await page.goto("/sell");
    await expect(page.getByText("Wallet balance: 5,000.")).toBeVisible();
    await page.getByTestId("sell-amount").fill("200000");
    await page.getByTestId("sell-submit").click();
    await expect(page.getByTestId("field-error").first()).toContainText("more BACKSTOP than your wallet holds");
    await expect(page.getByRole("heading", { name: "Your Return Tickets" })).toBeVisible();
    await expect(page.getByText("300K BACKSTOP")).toBeVisible();
  });
});
