import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const here = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.join(here, "..");

// Content-Security-Policy: the app only talks to its own API, the configured
// RPC and (optionally) the SOL price endpoint — all fixed at build time.
const origin = (u: string | undefined): string[] => {
  if (!u) return [];
  try {
    const o = new URL(u).origin;
    return [o, o.replace(/^http/, "ws")];
  } catch {
    return [];
  }
};
const dev = process.env.NODE_ENV !== "production";
const connectSrc = [
  "'self'",
  ...origin(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787"),
  ...origin(process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8899"),
  ...origin(process.env.NEXT_PUBLIC_SOL_PRICE_URL ?? "https://lite-api.jup.ag"),
];
const csp = [
  "default-src 'self'",
  // Next.js emits inline bootstrap scripts; no third-party scripts are loaded.
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src ${[...new Set(connectSrc)].join(" ")}`,
  // Solflare's web wallet runs in an iframe.
  "frame-src https://connect.solflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const config: NextConfig = {
  reactStrictMode: true,
  // e2e builds use a separate directory (dist/next-e2e) so they never replace a real build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  // pnpm workspace: the SDK lives outside this package.
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
    // @anchor-lang/core references `fs` in a Node-only code path.
    resolveAlias: { fs: { browser: "./src/lib/empty-module.ts" } },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
