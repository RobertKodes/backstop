// Build the web app with the e2e environment (into web/dist/next-e2e, so a real
// production build in web/.next is never replaced) and serve it.
// Set E2E_SKIP_BUILD=1 to reuse an existing e2e build.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "../../../web");
const nextBin = path.join(web, "node_modules", "next", "dist", "bin", "next");
const port = process.env.E2E_PORT ?? "3107";

export const E2E_ENV = {
  NEXT_DIST_DIR: "dist/next-e2e",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_API_URL: "http://localhost:8787",
  NEXT_PUBLIC_RPC_URL: "http://127.0.0.1:8899",
  NEXT_PUBLIC_CLUSTER: "localnet",
  // Left empty on purpose: the app discovers the root market from /v1/markets.
  NEXT_PUBLIC_MINT: "",
  NEXT_PUBLIC_QUOTE_MINT: "",
  NEXT_PUBLIC_SOL_PRICE_URL: "http://localhost:8787/__sol-price",
};

const env = { ...process.env, ...E2E_ENV };
const built = existsSync(path.join(web, "dist", "next-e2e", "BUILD_ID"));
if (!(process.env.E2E_SKIP_BUILD === "1" && built)) {
  const r = spawnSync(process.execPath, [nextBin, "build"], { cwd: web, env, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
const child = spawn(process.execPath, [nextBin, "start", "-p", port, "-H", "127.0.0.1"], {
  cwd: web,
  env,
  stdio: "inherit",
});
const stop = () => child.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
