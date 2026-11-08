#!/usr/bin/env node
// Copy linter for user-facing text (see docs/COPY_GUIDELINES.md).
//
// Scans string literals, template-literal text and JSX text in
// web/src/**/*.{ts,tsx} plus Markdown/MDX lines and JSON string values, and
// reports banned phrases, "yield" without "variable", and files that mention
// withdrawing without mentioning the time lock. Plain Node ESM, no deps.
//
// Usage: node scripts/lint-copy.mjs [dir ...]   (default: web/src)
// Escape: `// copy-lint-ignore` on the line, or `// copy-lint-ignore-next-line` above it.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXTS = new Set([".ts", ".tsx", ".md", ".mdx", ".json"]);
const SKIP_DIRS = new Set(["node_modules", ".next", ".next-e2e", "dist", "coverage"]);

const BANNED = [
  { re: /\bguarantee(?:d|s)?\b/i, label: "guaranteed" },
  { re: /\brisk[\s-]?free\b/i, label: "risk-free" },
  { re: /\bsafe\s+returns?\b/i, label: "safe returns" },
  { re: /\bprofits?\b/i, label: "profit" },
  { re: /\binvest(?:s|ed|ing|ment|ments|or|ors)?\b/i, label: "invest" },
  { re: /\bto the moon\b|\bmoon(?:ing)?\b/i, label: "price prediction (moon)" },
  { re: /\b\d{3,}x\b/i, label: "price prediction (Nx)" },
  { re: /\bprice\s+(?:will|is going to)\b/i, label: "price prediction" },
];
const YIELD = /\byields?\b/i;
const VARIABLE = /\bvariabl[ey]\b/i;
const WITHDRAW = /\bwithdraw(?:s|al|als|n|ing)?\b/i;
const LOCK = /\b(?:time-locked|lock|locks|locked|unlock|unlocks|unlocked|lock-up)\b/i;
const KEYWORDS_BEFORE_REGEX = new Set([
  "return",
  "typeof",
  "case",
  "do",
  "else",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "yield",
  "await",
]);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXTS.has(path.extname(name))) out.push(p);
  }
  return out;
}

/**
 * Lex a TS/TSX source into user-visible text segments: { text, line, kind }.
 * Comments are skipped; module specifiers are skipped; JSX text is only
 * collected in .tsx files and only when it reads like prose.
 */
export function lexSource(src, jsx) {
  const segs = [];
  const n = src.length;
  let i = 0;
  let line = 1;
  let lastSig = "";
  let lastWord = "";

  const push = (text, startLine, kind) => {
    if (/[A-Za-z]/.test(text)) segs.push({ text, line: startLine, kind });
  };

  function readString(q) {
    const start = line;
    const moduleSpecifier = lastWord === "from" || lastWord === "import" || lastWord === "require";
    let s = "";
    i++;
    while (i < n && src[i] !== q) {
      if (src[i] === "\\") {
        s += src[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (src[i] === "\n") break;
      s += src[i];
      i++;
    }
    i++;
    if (!moduleSpecifier) push(s, start, "string");
    lastSig = "s";
    lastWord = "";
  }

  function readTemplate() {
    i++;
    let s = "";
    let start = line;
    while (i < n && src[i] !== "`") {
      if (src[i] === "\\") {
        s += src[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (src[i] === "$" && src[i + 1] === "{") {
        push(s, start, "template");
        s = "";
        i += 2;
        code(true);
        start = line;
        continue;
      }
      if (src[i] === "\n") line++;
      s += src[i];
      i++;
    }
    i++;
    push(s, start, "template");
    lastSig = "s";
    lastWord = "";
  }

  function readRegex() {
    i++;
    let inClass = false;
    while (i < n) {
      const ch = src[i];
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "\n") break;
      if (inClass) {
        if (ch === "]") inClass = false;
      } else if (ch === "[") inClass = true;
      else if (ch === "/") {
        i++;
        break;
      }
      i++;
    }
    while (i < n && /[a-z]/i.test(src[i])) i++;
    lastSig = "r";
  }

  function jsxText() {
    let j = i;
    let s = "";
    while (j < n && src[j] !== "<" && src[j] !== "{" && src[j] !== "}") {
      s += src[j];
      j++;
    }
    const looksLikeCode = /[;=]|=>|&&|\|\||\w\(|^\s*[)\]>,.]/.test(s);
    if (!looksLikeCode && /[A-Za-z]{2,}/.test(s)) {
      const lead = (s.match(/^\s*/)?.[0].match(/\n/g) ?? []).length;
      push(s.replace(/\s+/g, " ").trim(), line + lead, "jsx");
      line += (s.match(/\n/g) ?? []).length;
      i = j;
    }
  }

  function code(untilBrace) {
    let depth = 0;
    while (i < n) {
      const c = src[i];
      const d = src[i + 1];
      if (c === "\n") {
        line++;
        i++;
        continue;
      }
      if (c === " " || c === "\t" || c === "\r") {
        i++;
        continue;
      }
      if (c === "/" && d === "/") {
        while (i < n && src[i] !== "\n") i++;
        continue;
      }
      if (c === "/" && d === "*") {
        i += 2;
        while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
          if (src[i] === "\n") line++;
          i++;
        }
        i += 2;
        continue;
      }
      if (c === '"' || c === "'") {
        readString(c);
        continue;
      }
      if (c === "`") {
        readTemplate();
        continue;
      }
      if (c === "/") {
        const regexOk =
          lastSig === "" ||
          /[(,=:[!&|?{};+\-*%~^<>]/.test(lastSig) ||
          (lastSig === "w" && KEYWORDS_BEFORE_REGEX.has(lastWord));
        if (regexOk) {
          readRegex();
          continue;
        }
      }
      if (/[A-Za-z0-9_$]/.test(c)) {
        let w = "";
        while (i < n && /[A-Za-z0-9_$]/.test(src[i])) w += src[i++];
        lastWord = w;
        lastSig = "w";
        continue;
      }
      if (c === "{") depth++;
      if (c === "}") {
        if (untilBrace && depth === 0) {
          i++;
          return;
        }
        depth--;
      }
      i++;
      lastSig = c;
      if (c !== ".") lastWord = lastWord === "import" || lastWord === "from" ? lastWord : "";
      if (jsx && c === ">") jsxText();
    }
  }

  code(false);
  return segs;
}

function lexMarkdown(src) {
  const segs = [];
  let fence = false;
  src.split(/\r?\n/).forEach((l, idx) => {
    if (/^\s*```/.test(l)) {
      fence = !fence;
      return;
    }
    if (!fence) segs.push({ text: l, line: idx + 1, kind: "md" });
  });
  return segs;
}

function lexJson(src) {
  const segs = [];
  const lines = src.split(/\r?\n/);
  lines.forEach((l, idx) => {
    for (const m of l.matchAll(/"((?:\\.|[^"\\])*)"/g)) {
      const after = l.slice(m.index + m[0].length);
      if (/^\s*:/.test(after)) continue; // keys
      segs.push({ text: m[1], line: idx + 1, kind: "json" });
    }
  });
  return segs;
}

export function lintText(file, src) {
  const ext = path.extname(file);
  const segs =
    ext === ".md" || ext === ".mdx"
      ? lexMarkdown(src)
      : ext === ".json"
        ? lexJson(src)
        : lexSource(src, ext === ".tsx");
  const lines = src.split(/\r?\n/);
  const ignored = (ln) =>
    /copy-lint-ignore(?!-next-line)/.test(lines[ln - 1] ?? "") ||
    /copy-lint-ignore-next-line/.test(lines[ln - 2] ?? "");
  const problems = [];
  let firstWithdraw = null;
  let mentionsLock = false;

  for (const s of segs) {
    if (ignored(s.line)) continue;
    const text = s.text;
    for (const b of BANNED) {
      const m = b.re.exec(text);
      if (m) problems.push({ line: s.line, msg: `banned phrase "${m[0]}" (${b.label})`, text });
    }
    if (YIELD.test(text)) {
      const span = text.split("\n").length;
      const srcLines = lines.slice(s.line - 1, s.line - 1 + Math.max(1, span)).join(" ");
      if (!VARIABLE.test(text) && !VARIABLE.test(srcLines))
        problems.push({ line: s.line, msg: `"yield" without "variable" in the same string or line`, text });
    }
    if (WITHDRAW.test(text) && firstWithdraw === null) firstWithdraw = s;
    if (LOCK.test(text)) mentionsLock = true;
  }
  if (firstWithdraw && !mentionsLock) {
    problems.push({
      line: firstWithdraw.line,
      msg: "withdrawal is mentioned but this file never says it is time-locked (mention the lock)",
      text: firstWithdraw.text,
    });
  }
  return problems;
}

function main() {
  const args = process.argv.slice(2);
  const dirs = args.length ? args.map((a) => path.resolve(a)) : [path.join(root, "web", "src")];
  const files = dirs.flatMap((d) => (statSync(d, { throwIfNoEntry: false })?.isFile() ? [d] : walk(d)));
  let count = 0;
  for (const f of files) {
    const problems = lintText(f, readFileSync(f, "utf8"));
    for (const p of problems) {
      count++;
      const rel = path.relative(process.cwd(), f).split(path.sep).join("/");
      const snippet = p.text.replace(/\s+/g, " ").trim().slice(0, 80);
      console.error(`${rel}:${p.line}: ${p.msg} — "${snippet}"`);
    }
  }
  if (count) {
    console.error(
      `\ncopy-lint: ${count} problem${count === 1 ? "" : "s"} in ${files.length} files. See docs/COPY_GUIDELINES.md.`,
    );
    process.exit(1);
  }
  console.log(`copy-lint: ${files.length} files checked, no problems.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
