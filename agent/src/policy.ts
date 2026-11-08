// The safety gate between the model and the chain. Pure and deterministic:
// every model proposal is classified here, and only `execute` decisions may
// become transactions. The on-chain AgentAuthority enforces the same bounds and
// cooldown again — this layer exists so that out-of-policy ideas become
// governance proposals with a clear reason instead of failed transactions.

import { paramIndex, PARAMS, validateParams, type ParamValues } from "./params.js";

export interface Bound {
  enabled: boolean;
  min: bigint;
  max: bigint;
  /** Unix seconds of the last agent update of this parameter. */
  lastUpdate: number;
}

export interface AuthorityView {
  agent: string;
  cooldownSecs: number;
  /** Indexed like PARAMS. */
  bounds: Bound[];
}

export interface Proposal {
  param: string;
  /** Proposed value in base units, as a decimal string (u64). */
  value: string;
  rationale: string;
}

export type DecisionKind =
  /** Inside bounds, off cooldown: send `agent_set_param`. */
  | "execute"
  /** Not agent-tunable or outside bounds: file for governance. */
  | "governance"
  /** In bounds but the parameter is cooling down: retry next cycle. */
  | "deferred"
  /** Rejected outright (malformed, no-op, breaks cross-parameter rules, over the per-run cap). */
  | "rejected";

export interface Decision {
  kind: DecisionKind;
  param: string;
  paramIndex: number;
  current: string;
  /** Value the model asked for. */
  requested: string;
  /** Value that will actually be applied (may be step-clamped). */
  value: string;
  clamped: boolean;
  bound?: { enabled: boolean; min: string; max: string };
  reason: string;
  rationale: string;
}

export interface PolicyOpts {
  now: number;
  maxActions: number;
  /** Max move per update as a fraction of the [min,max] window (bps). */
  maxStepBps: number;
}

const U64_MAX = (1n << 64n) - 1n;

function parseU64(v: string): bigint | null {
  if (!/^\d{1,20}$/.test(v.trim())) return null;
  const n = BigInt(v.trim());
  return n <= U64_MAX ? n : null;
}

/** Classify model proposals against current values and the on-chain authority. */
export function decide(proposals: Proposal[], current: ParamValues, auth: AuthorityView, opts: PolicyOpts): Decision[] {
  const out: Decision[] = [];
  const seen = new Set<string>();
  // Parameter values as they will be after the executed decisions, for the
  // cross-parameter checks (e.g. min ≤ base ≤ max discount).
  const projected: ParamValues = { ...current };
  let executed = 0;

  for (const p of proposals) {
    const idx = paramIndex(p.param);
    const base: Omit<Decision, "kind" | "reason"> = {
      param: p.param,
      paramIndex: idx,
      current: idx >= 0 ? String(current[p.param] ?? 0n) : "",
      requested: p.value,
      value: p.value,
      clamped: false,
      rationale: p.rationale,
    };
    if (idx < 0) {
      out.push({ ...base, kind: "rejected", reason: "unknown parameter" });
      continue;
    }
    if (seen.has(p.param)) {
      out.push({ ...base, kind: "rejected", reason: "duplicate proposal for the same parameter" });
      continue;
    }
    seen.add(p.param);
    const requested = parseU64(p.value);
    if (requested === null) {
      out.push({ ...base, kind: "rejected", reason: "value is not a valid u64" });
      continue;
    }
    const cur = current[p.param] ?? 0n;
    if (requested === cur) {
      out.push({ ...base, kind: "rejected", reason: "no change from current value" });
      continue;
    }
    const b = auth.bounds[idx];
    const bound = b ? { enabled: b.enabled, min: String(b.min), max: String(b.max) } : undefined;
    if (!b || !b.enabled) {
      out.push({ ...base, bound, kind: "governance", reason: "parameter is not agent-tunable" });
      continue;
    }
    if (requested < b.min || requested > b.max) {
      out.push({ ...base, bound, kind: "governance", reason: `outside agent bounds [${b.min}, ${b.max}]` });
      continue;
    }
    // Step limit: never move more than maxStepBps of the window in one update.
    const window = b.max - b.min;
    const maxStep = window === 0n ? 0n : (window * BigInt(opts.maxStepBps)) / 10_000n || 1n;
    let value = requested;
    let clamped = false;
    if (requested > cur && requested - cur > maxStep) {
      value = cur + maxStep;
      clamped = true;
    } else if (requested < cur && cur - requested > maxStep) {
      value = cur - maxStep;
      clamped = true;
    }
    if (value < b.min) value = b.min;
    if (value > b.max) value = b.max;
    if (value === cur) {
      out.push({ ...base, bound, kind: "rejected", reason: "step limit leaves no change" });
      continue;
    }
    const d = { ...base, bound, value: String(value), clamped };
    const readyAt = b.lastUpdate + auth.cooldownSecs;
    if (b.lastUpdate > 0 && opts.now < readyAt) {
      out.push({ ...d, kind: "deferred", reason: `cooling down until ${new Date(readyAt * 1000).toISOString()}` });
      continue;
    }
    const errs = validateParams({ ...projected, [p.param]: value });
    if (errs.length) {
      out.push({ ...d, kind: "rejected", reason: `breaks parameter invariants: ${errs.join("; ")}` });
      continue;
    }
    if (executed >= opts.maxActions) {
      out.push({ ...d, kind: "deferred", reason: `per-cycle action cap (${opts.maxActions}) reached` });
      continue;
    }
    executed += 1;
    projected[p.param] = value;
    out.push({ ...d, kind: "execute", reason: clamped ? `step-limited from ${requested}` : "within agent bounds" });
  }
  return out;
}

/** Human-readable bounds table for the model prompt. */
export function boundsTable(current: ParamValues, auth: AuthorityView, now: number): string {
  return PARAMS.map((p, i) => {
    const b = auth.bounds[i];
    const tunable = b?.enabled ? `agent-tunable [${b.min}, ${b.max}]` : "governance only";
    const cool = b?.enabled && b.lastUpdate > 0 && now < b.lastUpdate + auth.cooldownSecs ? " (cooling down)" : "";
    return `${p.name} = ${current[p.name] ?? 0n} ${p.unit} — ${p.description}; ${tunable}${cool}`;
  }).join("\n");
}
