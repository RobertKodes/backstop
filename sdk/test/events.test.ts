import { BorshCoder } from "@anchor-lang/core";
import { describe, expect, it } from "vitest";
import { IDLS, PROGRAM_IDS, parseEvents } from "../src/index.js";

/** Build a "Program data:" log line for an event via the IDL coder. */
function encodeEvent(idl: unknown, name: string, data: Record<string, unknown>): string {
  const coder = new BorshCoder(idl as never);
  // Anchor's BorshEventCoder has no encode; build discriminator + borsh manually.
  const ev = (idl as { events: { name: string; discriminator: number[] }[] }).events.find((e) => e.name === name)!;
  const layout = (coder.types as unknown as { encode: (n: string, d: unknown) => Buffer }).encode(name, data);
  return "Program data: " + Buffer.concat([Buffer.from(ev.discriminator), layout]).toString("base64");
}

describe("parseEvents", () => {
  it("attributes events to the emitting program across CPIs, in log order", () => {
    const pausesLine = encodeEvent(IDLS.core, "PausesUpdated", {
      mint: PROGRAM_IDS.amm,
      pauses: 3,
      by: PROGRAM_IDS.core,
    });
    const epochsLine = encodeEvent(IDLS.hook, "EpochsAdvanced", {
      mint: PROGRAM_IDS.amm,
      fromEpoch: 1,
      toEpoch: 5,
    });
    const logs = [
      `Program ${PROGRAM_IDS.core.toBase58()} invoke [1]`,
      pausesLine,
      `Program ${PROGRAM_IDS.hook.toBase58()} invoke [2]`,
      epochsLine,
      `Program ${PROGRAM_IDS.hook.toBase58()} success`,
      // the same bytes emitted by an unknown program must be ignored
      `Program 11111111111111111111111111111111 invoke [2]`,
      pausesLine,
      `Program 11111111111111111111111111111111 success`,
      `Program ${PROGRAM_IDS.core.toBase58()} success`,
    ];
    const evs = parseEvents(logs);
    expect(evs.map((e) => [e.program, e.name])).toEqual([
      ["core", "PausesUpdated"],
      ["hook", "EpochsAdvanced"],
    ]);
    expect(evs[0]!.data["pauses"]).toBe(3);
    expect(evs[1]!.index).toBe(1);
  });
});
