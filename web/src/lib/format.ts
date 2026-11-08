// Display formatting. Raw on-chain amounts are base-unit strings/bigints;
// conversions are done on bigints so large values never lose precision.

export const TOKEN_DECIMALS = 9;
export const USDC_DECIMALS = 6;
export const SOL_DECIMALS = 9;

/** Parse a raw base-unit value (string | number | bigint | null) into a bigint. */
export function toBig(v: string | number | bigint | null | undefined): bigint {
  if (v === null || v === undefined || v === "") return 0n;
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return Number.isFinite(v) ? BigInt(Math.trunc(v)) : 0n;
  const s = v.trim();
  // numeric columns can come back as "123.000" from Postgres
  const int = s.includes(".") ? s.slice(0, s.indexOf(".")) : s;
  try {
    return BigInt(int || "0");
  } catch {
    return 0n;
  }
}

/** Base units → decimal string with exactly `decimals` precision, trimmed. */
export function unitsToDecimalString(raw: bigint, decimals: number): string {
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  let fracStr = decimals > 0 ? frac.toString().padStart(decimals, "0").replace(/0+$/, "") : "";
  if (fracStr.length > 0) fracStr = `.${fracStr}`;
  return `${neg ? "-" : ""}${whole.toString()}${fracStr}`;
}

/** Base units → float (display only). */
export function toFloat(raw: string | number | bigint | null | undefined, decimals: number): number {
  return Number(unitsToDecimalString(toBig(raw), decimals));
}

/**
 * Parse a user-typed decimal amount into base units. Returns null for
 * invalid input or too many fractional digits.
 */
export function parseUnits(input: string, decimals: number): bigint | null {
  const s = input.trim().replace(/[,_\s]/g, "");
  if (!/^\d*(\.\d*)?$/.test(s) || s === "" || s === ".") return null;
  const [w = "", f = ""] = s.split(".");
  if (f.length > decimals) return null;
  return BigInt(w || "0") * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0");
}

const groupFmt = new Intl.NumberFormat("en-US");

/** Exact grouped number with at most `maxFrac` fractional digits (truncated). */
export function formatUnits(raw: string | number | bigint | null | undefined, decimals: number, maxFrac = 2): string {
  const v = toBig(raw);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, "0").slice(0, Math.max(0, maxFrac));
  frac = frac.replace(/0+$/, "");
  const wholeStr = groupFmt.format(whole);
  return `${neg ? "-" : ""}${wholeStr}${frac ? `.${frac}` : ""}`;
}

/** Compact amount, e.g. 1.25M, 980K. */
export function formatCompact(raw: string | number | bigint | null | undefined, decimals: number): string {
  const n = toFloat(raw, decimals);
  return formatCompactNumber(n);
}

export function formatCompactNumber(n: number): string {
  if (!Number.isFinite(n)) return "–";
  const abs = Math.abs(n);
  if (abs < 1_000) return n.toLocaleString("en-US", { maximumFractionDigits: abs < 10 ? 2 : 1 });
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
}

/** Price with sensible significant digits (tiny token prices need many). */
export function formatPrice(n: number | null | undefined, unit = ""): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  let s: string;
  if (n === 0) s = "0";
  else if (Math.abs(n) >= 1) s = n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  else s = n.toLocaleString("en-US", { maximumSignificantDigits: 4 });
  return unit ? `${s} ${unit}` : s;
}

/** Basis points → percentage string ("5.25%"). */
export function formatBps(bps: number | string | null | undefined, digits = 2): string {
  const n = Number(bps ?? 0);
  if (!Number.isFinite(n)) return "–";
  const s = (n / 100).toFixed(digits);
  return `${s.includes(".") ? s.replace(/\.?0+$/, "") : s}%`;
}

export function formatPercent(fraction: number, digits = 1): string {
  if (!Number.isFinite(fraction)) return "–";
  return `${(fraction * 100).toFixed(digits).replace(/\.0+$/, "")}%`;
}

/** Seconds → "mm:ss" (or "h:mm:ss" past an hour). Never negative. */
export function formatCountdown(totalSecs: number): string {
  const s = Math.max(0, Math.floor(totalSecs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Spoken form of a countdown for screen readers. */
export function spokenCountdown(totalSecs: number): string {
  const s = Math.max(0, Math.floor(totalSecs));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return `${sec} seconds`;
  return `${m} minute${m === 1 ? "" : "s"} ${sec} seconds`;
}

/** Human duration: "59 days", "3 hours", "12 minutes". */
export function formatDuration(totalSecs: number): string {
  const s = Math.max(0, Math.floor(totalSecs));
  const d = Math.floor(s / 86_400);
  if (d >= 2) return `${d} days`;
  const h = Math.floor(s / 3_600);
  if (h >= 2) return `${h} hours`;
  const m = Math.floor(s / 60);
  if (m >= 2) return `${m} minutes`;
  return `${s} seconds`;
}

export function shortAddress(addr: string | null | undefined, chars = 4): string {
  if (!addr) return "–";
  if (addr.length <= chars * 2 + 1) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

/** Timestamps arrive as ISO strings (REST) or unix seconds (WebSocket events). */
export function toDate(v: string | number | Date | null | undefined): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(v * 1000);
  if (/^\d+$/.test(v)) return new Date(Number(v) * 1000);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toUnixSecs(v: string | number | Date | null | undefined): number {
  const d = toDate(v);
  return d ? Math.floor(d.getTime() / 1000) : 0;
}

const dateFmt = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(v: string | number | Date | null | undefined): string {
  const d = toDate(v);
  return d ? dateFmt.format(d) : "–";
}

export function formatDateTime(v: string | number | Date | null | undefined): string {
  const d = toDate(v);
  return d ? dateTimeFmt.format(d) : "–";
}

export function timeAgo(v: string | number | Date | null | undefined, now = Date.now()): string {
  const d = toDate(v);
  if (!d) return "–";
  const secs = Math.round((now - d.getTime()) / 1000);
  if (secs < 0) return "just now";
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86_400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86_400)}d ago`;
}

/** Byte length of a UTF-8 string (on-chain limits are in bytes). */
export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}
