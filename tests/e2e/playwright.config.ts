import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3107);

/**
 * The web app is built into web/dist/next-e2e with a fixed test environment
 * (scripts/serve.mjs) and every API / RPC / WebSocket call is mocked in the
 * browser (fixtures/mock.ts), so no chain, indexer or API is needed.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  // Memory-constrained machines: keep the worker count low.
  workers: Number(process.env.E2E_WORKERS ?? 2),
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: "node scripts/serve.mjs",
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: { E2E_PORT: String(PORT) },
    stdout: "pipe",
    stderr: "pipe",
  },
});
