import { describe, expect, it } from "vitest";

import {
  byteLength,
  formatBps,
  formatCompactNumber,
  formatCountdown,
  formatUnits,
  parseUnits,
  shortAddress,
  spokenCountdown,
  toBig,
  toDate,
  unitsToDecimalString,
} from "@/lib/format";

describe("units", () => {
  it("parses user input exactly", () => {
    expect(parseUnits("1.5", 6)).toBe(1_500_000n);
    expect(parseUnits("1,000", 9)).toBe(1_000_000_000_000n);
    expect(parseUnits(".25", 6)).toBe(250_000n);
    expect(parseUnits("0.0000001", 6)).toBeNull();
    expect(parseUnits("abc", 6)).toBeNull();
    expect(parseUnits("", 6)).toBeNull();
    expect(parseUnits("-1", 6)).toBeNull();
  });

  it("formats base units without float drift", () => {
    expect(formatUnits("123456789012345678", 9, 4)).toBe("123,456,789.0123");
    expect(formatUnits(1_500_000n, 6)).toBe("1.5");
    expect(formatUnits("1000000", 6, 2)).toBe("1");
    expect(formatUnits("-2500000", 6)).toBe("-2.5");
    expect(unitsToDecimalString(1_234_500n, 6)).toBe("1.2345");
  });

  it("reads Postgres numeric strings", () => {
    expect(toBig("42.000")).toBe(42n);
    expect(toBig(null)).toBe(0n);
    expect(toBig("garbage")).toBe(0n);
  });
});

describe("display helpers", () => {
  it("formats countdowns", () => {
    expect(formatCountdown(462)).toBe("07:42");
    expect(formatCountdown(-5)).toBe("00:00");
    expect(formatCountdown(3_725)).toBe("1:02:05");
    expect(spokenCountdown(462)).toBe("7 minutes 42 seconds");
    expect(spokenCountdown(9)).toBe("9 seconds");
  });

  it("formats bps, compact numbers and addresses", () => {
    expect(formatBps(620)).toBe("6.2%");
    expect(formatBps(500, 0)).toBe("5%");
    expect(formatBps(5_000, 0)).toBe("50%");
    expect(formatBps(1_200)).toBe("12%");
    expect(formatCompactNumber(1_650_000)).toBe("1.65M");
    expect(shortAddress("LmHQDLm9kZWsakph1wvavr1ukikBGQaThTPSPyK9Bof")).toBe("LmHQ…9Bof");
  });

  it("parses REST and WebSocket timestamps", () => {
    expect(toDate("1700000000")?.toISOString()).toBe("2023-11-14T22:13:20.000Z");
    expect(toDate("2024-01-01T00:00:00Z")?.getUTCFullYear()).toBe(2024);
    expect(toDate("")).toBeNull();
  });

  it("measures on-chain byte limits", () => {
    expect(byteLength("abc")).toBe(3);
    expect(byteLength("é")).toBe(2);
  });
});
