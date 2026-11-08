import { describe, expect, it } from "vitest";

import { checkLaunchForm } from "@/lib/launch";
import { cleanSellerMessage, containsProfanity, maskProfanity } from "@/lib/profanity";

describe("seller message filter", () => {
  it("masks profanity including simple leetspeak", () => {
    expect(maskProfanity("selling this sh1t to pay rent")).toBe("selling this s*** to pay rent");
    expect(maskProfanity("SHIT happens")).toBe("S*** happens");
    expect(containsProfanity("Need cash for a house")).toBe(false);
  });

  it("leaves ordinary words alone", () => {
    expect(maskProfanity("cockpit Dickens scrap class")).toBe("cockpit Dickens scrap class");
  });

  it("strips control and bidi characters and caps length", () => {
    expect(cleanSellerMessage("hi‮there\u0007")).toBe("hithere");
    expect(cleanSellerMessage("x".repeat(200))).toHaveLength(140);
    expect(cleanSellerMessage(null)).toBe("");
  });
});

describe("launch form", () => {
  const base = {
    name: "Harbor",
    symbol: "HRBR",
    uri: "https://example.org/m.json",
    supply: "1000000000",
    creatorPct: "3",
    liquiditySol: "5",
  };

  it("accepts valid params", () => {
    const r = checkLaunchForm(base);
    expect(r.errors).toEqual({});
    expect(r.params).toMatchObject({ creatorBps: 300, liquidityLamports: 5_000_000_000n, supply: 10n ** 18n });
  });

  it("enforces at least 5 SOL liquidity and at most 5% creator allocation", () => {
    const r = checkLaunchForm({ ...base, creatorPct: "5.01", liquiditySol: "4.99" });
    expect(r.params).toBeNull();
    expect(r.errors.creatorPct).toMatch(/0% and 5%/);
    expect(r.errors.liquiditySol).toMatch(/at least 5 SOL/);
  });

  it("checks names, symbols and metadata links", () => {
    const r = checkLaunchForm({ ...base, name: "", symbol: "WAYTOOLONGSYM", uri: "ftp://x" });
    expect(r.errors.name).toBeDefined();
    expect(r.errors.symbol).toBeDefined();
    expect(r.errors.uri).toMatch(/https/);
  });
});
