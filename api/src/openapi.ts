// Write the generated OpenAPI document: `pnpm --filter @backstop/api openapi`.
import { writeFileSync } from "node:fs";
import { buildApp, MemoryCache } from "./app.js";
import type { Repo } from "./repo.js";

const out = process.argv[2] ?? "openapi.json";
const app = await buildApp({ repo: {} as Repo, cache: new MemoryCache() });
await app.ready();
writeFileSync(out, JSON.stringify(app.swagger(), null, 2));
console.warn(`wrote ${out}`);
await app.close();
