import { D, expect, test } from "../fixtures/mock";

test.describe("Treasury", () => {
  test("shows SOL held, the floor and a redeem preview", async ({ page }) => {
    await page.goto("/treasury");
    const facts = page.getByTestId("treasury-facts");
    await expect(facts).toContainText("120,000 SOL");
    await expect(facts).toContainText("0.0002 SOL");
    await expect(facts).toContainText("about $18M at the current SOL price");
    await expect(page.getByTestId("treasury-chart")).toBeVisible();

    await page.getByTestId("redeem-amount").fill("1000");
    const preview = page.getByTestId("redeem-preview");
    await expect(preview).toContainText("Pro-rata share0.2 SOL");
    await expect(preview).toContainText("Redemption fee (1%)− 0.002 SOL");
    await expect(page.getByTestId("redeem-net")).toHaveText("0.198 SOL");
    await expect(page.getByTestId("redeem-submit")).toHaveText("Connect wallet to redeem");
  });
});

test.describe("Leaderboards", () => {
  test("switches between tenure, absorbers and Shield tabs (mouse and keyboard)", async ({ page }) => {
    await page.goto("/leaderboards");
    const tabs = page.getByRole("tablist", { name: "Leaderboards" });
    await expect(tabs.getByRole("tab", { name: "Oldest bags" })).toHaveAttribute("aria-selected", "true");
    const tenure = page.getByTestId("leaderboard-tenure");
    await expect(tenure.locator("tbody tr")).toHaveCount(3);
    await expect(tenure.locator("tbody tr").first()).toContainText("90 days");
    await expect(tenure.locator("tbody tr").first()).toContainText("3.00×");

    await tabs.getByRole("tab", { name: "Top absorbers" }).click();
    await expect(page.getByTestId("leaderboard-absorbers")).toContainText("37");
    await expect(page.getByRole("tabpanel")).toContainText("absorbed the most tokens");

    await tabs.getByRole("tab", { name: "Top absorbers" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.getByRole("tab", { name: "Top Shield" })).toHaveAttribute("aria-selected", "true");
    await expect(tabs.getByRole("tab", { name: "Top Shield" })).toBeFocused();
    await expect(page.getByTestId("leaderboard-shield")).toContainText("720,000");
    await page.keyboard.press("Home");
    await expect(tabs.getByRole("tab", { name: "Oldest bags" })).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("Launchpad", () => {
  test("wizard validates each step, including 5 SOL minimum and 5% creator cap", async ({ page }) => {
    await page.goto("/launchpad");
    const wizard = page.getByTestId("launch-wizard");
    await page.getByTestId("launch-next").click();
    await expect(wizard).toContainText("Name must be 1–32 bytes.");
    await expect(wizard).toContainText("Symbol must be 1–10 bytes.");

    await page.getByTestId("launch-name").fill("Harbor");
    await page.getByTestId("launch-symbol").fill("HRBR");
    await page.getByTestId("launch-uri").fill("https://example.org/hrbr.json");
    await page.getByTestId("launch-next").click();
    await expect(wizard).toContainText("Step 2 of 4");

    await page.getByTestId("launch-creator").fill("6");
    await page.getByTestId("launch-next").click();
    await expect(wizard).toContainText("Creator allocation must be between 0% and 5%.");
    await expect(wizard).toContainText("Step 2 of 4");
    await page.getByTestId("launch-creator").fill("3");
    await page.getByTestId("launch-next").click();
    await expect(wizard).toContainText("Step 3 of 4");

    await page.getByTestId("launch-liquidity").fill("4.5");
    await page.getByTestId("launch-next").click();
    await expect(wizard).toContainText("Initial liquidity must be at least 5 SOL.");
    await expect(wizard).toContainText("Liquidity is locked forever.");
    await page.getByTestId("launch-liquidity").fill("5");
    await page.getByTestId("launch-next").click();

    const review = page.getByTestId("launch-review");
    await expect(review).toContainText("Harbor");
    await expect(review).toContainText("3% (30M tokens, vested over 90 days)");
    await expect(review).toContainText("5 SOL, locked forever");
    await expect(page.getByTestId("launch-next")).toHaveText("Connect wallet to launch");
  });

  test("every child shows a risk panel", async ({ page }) => {
    await page.goto("/launchpad");
    const cards = page.getByTestId("child-card");
    await expect(cards).toHaveCount(2);
    const first = cards.first();
    await expect(first).toContainText("Harbor");
    await expect(first.getByTestId("risk-creator")).toHaveText("3%");
    await expect(first).toContainText("67% vested");
    await expect(first).toContainText("12 SOL");
    await expect(first).toContainText("Liquidity is locked forever and cannot be withdrawn by anyone.");
    await expect(first).toContainText("Mint authority revoked");
    await expect(first).toContainText("Not indexed yet");
    await expect(cards.nth(1)).toContainText("No creator allocation");
    await expect(page.getByTestId("risk-panel")).toHaveCount(2);
  });

  test("child dashboard shows market data and the risk panel", async ({ page }) => {
    await page.goto(`/launchpad/${D.A.child1}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Harbor");
    await expect(page.getByTestId("risk-panel")).toBeVisible();
    await expect(page.getByTestId("price-chart")).toBeVisible();
  });
});

test.describe("Launchpad (wallet connected)", () => {
  test.use({ connected: true });

  test("runs the launch as numbered transactions and stops cleanly when a step is declined", async ({ page }) => {
    await page.goto("/launchpad");
    await page.getByTestId("launch-name").fill("Harbor");
    await page.getByTestId("launch-symbol").fill("HRBR");
    await page.getByTestId("launch-next").click();
    await page.getByTestId("launch-next").click();
    await page.getByTestId("launch-next").click();
    await expect(page.getByTestId("launch-next")).toHaveText("Launch token");
    await page.getByTestId("launch-next").click();

    // The mock wallet declines every signature: step 1 fails, later steps never run.
    const progress = page.getByTestId("launch-progress");
    await expect(progress.locator("li").first()).toContainText("Failed");
    await expect(progress.locator("li").first()).toContainText("1. Create mint");
    expect(await progress.locator("li").count()).toBeGreaterThan(1);
    await expect(progress.locator("li").nth(1)).toContainText("Waiting");
    const err = page.getByTestId("launch-error");
    await expect(err).toContainText("Step 1 (Create mint) did not complete: You declined the request in your wallet.");
    await expect(err).toContainText("Resume launch");

    // Resuming reads chain state for the pending mint; nothing exists on this mocked chain.
    await page.getByTestId("launch-resume").click();
    await expect(err).toContainText("Could not resume the launch");
  });

  test("the creator can claim vested tokens from the child dashboard", async ({ page }) => {
    await page.goto(`/launchpad/${D.A.child1}`);
    await expect(page.getByTestId("creator-claim")).toBeVisible();
    await page.getByTestId("creator-claim").getByRole("button", { name: "Claim vested tokens" }).click();
    await expect(page.getByTestId("toast").last()).toContainText("did not complete");
  });
});

test.describe("Agent feed", () => {
  test("lists posts with decisions, actions and the snapshot behind them", async ({ page }) => {
    await page.goto("/agent");
    const posts = page.getByTestId("agent-post");
    await expect(posts).toHaveCount(2);
    const first = posts.first();
    await expect(first).toContainText("Market review");
    await expect(first).toContainText("Offers cleared at an average 5.4% discount");
    await expect(first).toContainText("Decisions (2)");
    await expect(first).toContainText("Shield per offer cap");
    await expect(first).toContainText("Applied by the agent");
    await expect(first).toContainText("(limited by the step cap)");
    await expect(first).toContainText("Sent to governance");
    await expect(first).toContainText("parameter is not agent-tunable");
    await expect(first).toContainText("Actions taken (1)");
    await expect(first).toContainText("Dry run (not sent)");
    const toggle = first.getByRole("button", { name: /Show the market snapshot/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(first).toContainText("Shield deposits");
    await expect(first.getByRole("button", { name: /Hide the market snapshot/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
});

test.describe("Theme", () => {
  test("toggles dark and light and persists across reloads", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "light");
    await page.getByTestId("theme-toggle").click();
    await expect(html).toHaveAttribute("data-theme", "dark");
    expect(await page.evaluate(() => localStorage.getItem("backstop-theme"))).toBe("dark");
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(page.getByTestId("theme-toggle")).toHaveAttribute("aria-label", "Switch to light theme");
    await page.getByTestId("theme-toggle").click();
    await expect(html).toHaveAttribute("data-theme", "light");
  });
});

test.describe("Keyboard", () => {
  test("skip link moves focus to the main content", async ({ page }) => {
    await page.goto("/sell");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();
  });
});
