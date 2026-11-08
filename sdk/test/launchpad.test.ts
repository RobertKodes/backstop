import { BorshCoder } from "@anchor-lang/core";
import { Connection, Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import { IDLS, LaunchpadClient, PROGRAM_IDS, pda, validateLaunchParams, vestedAmount } from "../src/index.js";

const params = {
  name: "Night Frog",
  symbol: "FROG",
  uri: "https://example.org/frog.json",
  supply: 100_000_000n * 10n ** 9n,
  creatorBps: 500,
  liquidityLamports: 6_000_000_000n,
};

describe("launchpad client", () => {
  it("validates launch parameters like the program", () => {
    expect(validateLaunchParams(params)).toEqual([]);
    expect(validateLaunchParams({ ...params, creatorBps: 501 })).toHaveLength(1);
    expect(validateLaunchParams({ ...params, liquidityLamports: 4_000_000_000n })).toHaveLength(1);
    expect(validateLaunchParams({ ...params, name: "x".repeat(33), symbol: "" })).toHaveLength(2);
  });

  it("builds the ordered launch transactions offline", async () => {
    const lp = new LaunchpadClient(new Connection("http://127.0.0.1:1"), Keypair.generate().publicKey);
    const creator = Keypair.generate().publicKey;
    const mint = Keypair.generate();
    const steps = await lp.launchSteps(creator, mint, params);
    expect(steps.map((s) => s.label)).toEqual([
      "Create mint",
      "Attach transfer hook",
      "Allocate tenure ledger",
      "Mint fixed supply, revoke mint authority",
      "Create market",
      "Lock initial liquidity",
      "Open offer book",
      "Open chests and Shield (go live)",
    ]);
    expect(steps[0]!.signers).toEqual([mint]);
    const coder = new BorshCoder(IDLS.launchpad as never);
    const names = steps.flatMap((s) => s.ixs.filter((ix) => ix.programId.equals(PROGRAM_IDS.launchpad)).map((ix) => coder.instruction.decode(ix.data)?.name));
    expect(names.map((n) => n?.replace(/_(\w)/g, (_, c: string) => c.toUpperCase()))).toEqual([
      "createChild",
      "initChildHook",
      "mintChildSupply",
      "initChildMarket",
      "initChildPool",
      "initChildBook",
      "initChildChests",
    ]);
    const grow = steps[2]!.ixs.filter((ix) => ix.programId.equals(PROGRAM_IDS.hook));
    expect(grow).toHaveLength(4);
    const create = steps[0]!.ixs.find((ix) => ix.programId.equals(PROGRAM_IDS.launchpad))!;
    expect(create.keys[1]!.pubkey.equals(mint.publicKey) && create.keys[1]!.isSigner).toBe(true);
    expect(create.keys[5]!.pubkey.equals(pda.child(mint.publicKey))).toBe(true);
  });

  it("rejects invalid parameters before building", async () => {
    const lp = new LaunchpadClient(new Connection("http://127.0.0.1:1"), Keypair.generate().publicKey);
    await expect(lp.launchSteps(Keypair.generate().publicKey, Keypair.generate(), { ...params, creatorBps: 900 })).rejects.toThrow(/5%/);
  });

  it("vests linearly over the schedule", () => {
    const info = { creatorAmount: 1_000n, vestingStart: 100, vestingEnd: 1_100 };
    expect(vestedAmount(info, 50)).toBe(0n);
    expect(vestedAmount(info, 600)).toBe(500n);
    expect(vestedAmount(info, 5_000)).toBe(1_000n);
    expect(vestedAmount({ ...info, vestingStart: 0 }, 600)).toBe(0n);
  });
});
