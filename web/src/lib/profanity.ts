// Basic client-side profanity mask for seller messages. Messages are
// on-chain and immutable; this only changes how they are displayed.
// The word list is stored ROT13-encoded to keep the source readable.

const ENCODED = [
  "shpx",
  "shpxre",
  "shpxvat",
  "fuvg",
  "fuvggl",
  "ovgpu",
  "nffubyr",
  "onfgneq",
  "phag",
  "qvpx",
  "pbpx",
  "chffl",
  "jnaxre",
  "gjng",
  "fyhg",
  "juber",
  "snttbg",
  "avttre",
  "avttn",
  "ergneq",
  "zbgureshpxre",
  "oybjwbo",
];

const rot13 = (s: string) =>
  s.replace(/[a-z]/gi, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });

const WORDS = ENCODED.map((w) => rot13(w));
const SUFFIXES = ["", "s", "es", "ed", "er", "ers", "ing", "y"];

const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
  "!": "i",
};

function normalise(word: string): string {
  return word
    .toLowerCase()
    .split("")
    .map((c) => LEET[c] ?? c)
    .join("")
    .replace(/[^a-z]/g, "")
    .replace(/(.)\1{2,}/g, "$1$1");
}

function isProfane(token: string): boolean {
  const n = normalise(token);
  if (!n) return false;
  return WORDS.some((w) => SUFFIXES.some((suffix) => n === w + suffix));
}

/** Replace profane words with the first letter followed by asterisks. */
export function maskProfanity(text: string): string {
  return text.replace(/[\p{L}\p{N}@$!]+/gu, (tok) =>
    isProfane(tok) ? tok[0] + "*".repeat(Math.max(1, tok.length - 1)) : tok,
  );
}

export function containsProfanity(text: string): boolean {
  return (text.match(/[\p{L}\p{N}@$!]+/gu) ?? []).some(isProfane);
}

/** Seller messages are ≤ 140 bytes on-chain; strip control characters for display. */
export function cleanSellerMessage(raw: string | null | undefined): string {
  if (!raw) return "";
  const visible = raw.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, "").trim();
  return maskProfanity(visible.slice(0, 140));
}
