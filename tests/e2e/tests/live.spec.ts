import { D, expect, test } from "../fixtures/mock";

test.describe("Live page", () => {
  test("renders live offers with ticking countdowns", async ({ page }) => {
    await page.goto("/");
    const rows = page.getByTestId("offer-row");
    await expect(rows).toHaveCount(2);
    // Soonest to close first.
    await expect(rows.first()).toContainText("No. 41");
    await expect(rows.first()).toContainText("4.8%");
    const clock = rows.first().getByTestId("countdown");
    await expect(clock).toHaveText(/^0[0-3]:\d\d$/);
    const before = Number(await clock.getAttribute("data-remaining"));
    await expect
      .poll(async () => Number(await clock.getAttribute("data-remaining")), { timeout: 5_000 })
      .toBeLessThan(before);
    await expect(clock).toHaveAttribute("role", "timer");
    await expect(clock).toHaveAttribute("aria-label", /Closes in \d+ minutes? \d+ seconds/);

    // Hero clock shows the next offer to close.
    await expect(page.getByTestId("next-offer")).toContainText("Offer No. 41 closes in");
  });

  test("absorbed today, absorption meter and price chart with floor", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("absorbed-today")).toContainText("1.65M");
    await expect(page.getByTestId("absorbed-today")).toContainText("76,500 USDC");
    const meter = page.getByTestId("absorption-meter");
    // Shield slice is capped at 10,000 per offer + 38,000 Auto-Absorb.
    await expect(meter).toContainText("48,000");
    await expect(meter).toContainText("450,000");
    await expect(meter).toContainText("from 12 chests");
    const chart = page.getByTestId("price-chart");
    await expect(chart).toBeVisible();
    await expect(chart.getByRole("list", { name: "Legend" })).toContainText("Treasury floor (USDC)");
    await expect(chart.getByRole("img")).toHaveAttribute("aria-label", /Treasury floor about 0\.03 USDC/);
    await page.getByTestId("chart-range").getByText("7 days").click();
    await expect(chart.getByRole("img")).toHaveAttribute("aria-label", /last 7 days/);
  });

  test("live WebSocket events add offers and update coverage", async ({ page, live }) => {
    await page.goto("/");
    await expect(page.getByTestId("offer-row")).toHaveCount(2);
    await expect.poll(() => live.subscribed).toContain(D.A.mint);
    await expect(page.getByTestId("live-status")).toHaveAttribute("data-status", "live");

    const now = Math.floor(Date.now() / 1000);
    live.push([
      {
        name: "OfferCreated",
        data: {
          mint: D.A.mint,
          offer: D.A.offer3,
          id: "43",
          seller: D.A.seller1,
          amount: "800000000000000",
          lots: 100,
          lotSize: "8000000000000",
          lotCost: "375200000",
          twap: D.PRICE,
          fillPrice: "46900000000000",
          discountBps: 700,
          momentumBps: "-1000",
          createdAt: String(now),
          expiresAt: String(now + 600),
          message: "",
        },
      },
    ]);
    const added = page.locator(`[data-offer="${D.A.offer3}"]`);
    await expect(added).toBeVisible();
    await expect(added).toContainText("No. 43");
    await expect(added).toContainText("7%");
    await expect(added.getByTestId("countdown")).toHaveText(/^(10|09):\d\d$/);
    await expect(page.getByTestId("offer-row")).toHaveCount(3);

    live.push([
      {
        name: "BidPlaced",
        data: {
          mint: D.A.mint,
          offer: D.A.offer3,
          bid: D.A.holder1,
          bidder: D.A.bidder1,
          kind: 0,
          amount: "18760000000",
          capacity: 50,
          prefix: 0,
          totalCapacity: "50",
          ts: now,
        },
      },
    ]);
    await expect(added).toContainText("50% covered");

    live.push([{ name: "OfferSettled", data: { mint: D.A.mint, offer: D.A.offer1 } }]);
    await expect(page.getByTestId("offer-row")).toHaveCount(2);
  });
});

test.describe("Live page without a live feed", () => {
  test.use({ mock: { wsDown: true } });
  test("shows polling status and still lists offers", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("offer-row")).toHaveCount(2);
    await expect(page.getByText("Live updates unavailable; refreshing every 5 seconds")).toBeVisible();
  });
});

test.describe("Live page with the API down", () => {
  test.use({ mock: { apiDown: true } });
  test("explains the outage instead of failing", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("error-note").first()).toContainText("Could not load");
    await expect(page.getByRole("button", { name: "Try again" }).first()).toBeVisible();
  });
});
