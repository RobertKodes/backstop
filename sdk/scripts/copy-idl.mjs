// Copy IDL JSON files next to the compiled output (tsc does not copy JSON
// imported via `with { type: "json" }` reliably across module settings).
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const src = new URL("../src/idl", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const dst = new URL("../dist/idl", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
if (existsSync(src)) {
  mkdirSync(dst, { recursive: true });
  for (const f of readdirSync(src)) if (f.endsWith(".json")) cpSync(join(src, f), join(dst, f));
}
