import { describe, expect, it } from "vitest";

import { copyViolations, templateNarration } from "../src/copy.js";
import { fitPost } from "../src/x.js";
import { snapshot } from "./fixtures.js";

describe("copy guidelines", () => {
  it("flags banned framing", () => {
    expect(copyViolations("Absorbing is guaranteed to pay")).toHaveLength(1);
    expect(copyViolations("a risk-free way to hold")[0]!.rule).toMatch(/risk-free/);
    expect(copyViolations("Chests earn 8% APY").map((v) => v.match)).toEqual(["APY"]);
    expect(copyViolations("a great investment")).toHaveLength(1);
    expect(copyViolations("You can withdraw from your chest any time")[0]!.rule).toMatch(/time-locked/);
  });

  it("allows compliant wording", () => {
    expect(copyViolations("Idle chest USDC earned a variable yield of 4.1% over the window.")).toEqual([]);
    expect(copyViolations("Chest withdrawals are time-locked for 7 days.")).toEqual([]);
    expect(copyViolations("22 offers, 71% absorbed by holders and the Shield.")).toEqual([]);
  });

  it("template narration is compliant and fits X", () => {
    const t = templateNarration(snapshot(), []);
    expect(copyViolations(`${t.post}\n${t.feed}`)).toEqual([]);
    expect(t.post.length).toBeLessThanOrEqual(280);
    expect(t.post).toMatch(/22 sell offers, 71% absorbed/);
  });

  it("fits posts into 280 characters with a suffix", () => {
    const long = "x".repeat(400);
    const p = fitPost(long, "https://backstop.example/agent");
    expect(p.length).toBe(280);
    expect(p.endsWith(" https://backstop.example/agent")).toBe(true);
    expect(fitPost("short")).toBe("short");
  });
});
