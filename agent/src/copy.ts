// Copy guidelines (docs/COPY_GUIDELINES.md) applied to everything the agent
// publishes. A violating text is never posted; the cycle falls back to a
// deterministic, compliant narration built from the snapshot.

import type { Decision } from "./policy.js";
import type { Snapshot } from "./snapshot.js";

export interface CopyViolation {
  rule: string;
  match: string;
}

const RULES: { rule: string; test: (t: string) => string | null }[] = [
  { rule: 'never say "guaranteed"', test: (t) => /\bguarantee(d|s)?\b/i.exec(t)?.[0] ?? null },
  { rule: 'never say "risk-free"', test: (t) => /\brisk[\s-]?free\b/i.exec(t)?.[0] ?? null },
  {
    rule: '"yield"/"APY"/"APR" only next to "variable"',
    test: (t) => {
      const re = /\b(yields?|apy|apr)\b/gi;
      for (let m = re.exec(t); m; m = re.exec(t)) {
        const window = t.slice(Math.max(0, m.index - 24), m.index + m[0].length + 24);
        if (!/\bvariable\b/i.test(window)) return m[0];
      }
      return null;
    },
  },
  {
    rule: "no investment/security framing",
    test: (t) => /\b(investment|security token|returns? on|profit(s|able)?|passive income)\b/i.exec(t)?.[0] ?? null,
  },
  {
    rule: "no calls to action or predictions",
    test: (t) => /\b(buy now|to the moon|moon(ing)?|will (pump|rise|go up)|price target|nfa)\b/i.exec(t)?.[0] ?? null,
  },
  {
    rule: "chest withdrawals must be described as time-locked",
    test: (t) =>
      /\bwithdraw/i.test(t) && /\bchest/i.test(t) && !/time[\s-]?lock/i.test(t) ? "chest withdrawal" : null,
  },
];

export function copyViolations(text: string): CopyViolation[] {
  const out: CopyViolation[] = [];
  for (const r of RULES) {
    const m = r.test(text);
    if (m) out.push({ rule: r.rule, match: m });
  }
  return out;
}

const fmt = (n: number | null, dp = 2) =>
  n === null ? "n/a" : n.toLocaleString("en-US", { maximumFractionDigits: dp });

/** Compliant fallback narration from numbers only. */
export function templateNarration(s: Snapshot, decisions: Decision[]): { post: string; feed: string } {
  const executed = decisions.filter((d) => d.kind === "execute");
  const gov = decisions.filter((d) => d.kind === "governance");
  const absorb = s.offers.absorptionRate === null ? "n/a" : `${Math.round(s.offers.absorptionRate * 100)}%`;
  const change = executed.length
    ? ` Adjusted ${executed.map((d) => d.param).join(", ")} within governance bounds.`
    : " No parameter changes.";
  const post = `Last ${s.windowHours}h: ${s.offers.created} sell offers, ${absorb} absorbed by holders and the Shield, ${fmt(s.fees.distributed)} ${s.quote} in fees distributed.${change}`;
  const feed = [
    post,
    `Price ${s.price.changePct24h === null ? "flat/no trades" : `${s.price.changePct24h > 0 ? "+" : ""}${fmt(s.price.changePct24h)}%`} over the window; treasury floor ${fmt(s.treasury.floorPrice, 9)} SOL per token.`,
    gov.length ? `Filed ${gov.length} proposal(s) for governance review: ${gov.map((d) => d.param).join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return { post: post.slice(0, 280), feed };
}
