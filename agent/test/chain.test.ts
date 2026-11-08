import BN from "bn.js";
import { BorshCoder } from "@anchor-lang/core";
import { IDLS, makePrograms, pda } from "@backstop/sdk";
import { Connection, Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import { buildSetParamIx, paramVariant } from "../src/chain.js";
import { PARAMS } from "../src/params.js";
import { XApiPoster } from "../src/x.js";

describe("agent_set_param instruction", () => {
  it("encodes the ParamId variant, value and accounts", async () => {
    const programs = makePrograms(new Connection("http://127.0.0.1:8899"));
    const agent = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;
    const idx = PARAMS.findIndex((p) => p.name === "yieldBufferBps");
    const ix = await buildSetParamIx(programs, agent, mint, idx, 2_250n);

    const decoded = new BorshCoder(IDLS.core as never).instruction.decode(ix.data);
    expect(decoded?.name).toMatch(/agent_?[sS]et_?[pP]aram/);
    const data = decoded!.data as { param: Record<string, unknown>; value: BN };
    // the coder reports the IDL's variant casing
    expect(Object.keys(data.param).map((k) => k.charAt(0).toLowerCase() + k.slice(1))).toEqual(["yieldBufferBps"]);
    expect(data.value.toString()).toBe("2250");
    expect(ix.keys.map((k) => [k.pubkey.toBase58(), k.isSigner, k.isWritable])).toEqual([
      [agent.toBase58(), true, false],
      [pda.market(mint).toBase58(), false, true],
      [pda.agent(mint).toBase58(), false, true],
    ]);
  });

  it("matches the on-chain ParamId order", () => {
    const enumType = (IDLS.core as unknown as { types: { name: string; type: { kind: string; variants?: { name: string }[] } }[] }).types.find(
      (t) => t.name === "ParamId",
    );
    const variants = enumType!.type.variants!.map((v) => v.name.replace(/_(\w)/g, (_, c: string) => c.toUpperCase()));
    expect(variants.map((v) => v[0]!.toLowerCase() + v.slice(1))).toEqual(PARAMS.map((p) => p.name));
    expect(paramVariant(0)).toEqual({ tradeFeeBps: {} });
  });
});

describe("X poster", () => {
  it("posts with a bearer token and returns the tweet id", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ data: { id: "1850", text: "hi" } }), { status: 201 });
    }) as unknown as typeof fetch;
    const p = new XApiPoster("tok", "https://api.x.com/2/tweets", fake);
    expect(await p.post("hello")).toEqual({ id: "1850" });
    expect(calls[0]!.url).toBe("https://api.x.com/2/tweets");
    expect(new Headers(calls[0]!.init.headers).get("authorization")).toBe("Bearer tok");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ text: "hello" });
  });

  it("surfaces API errors", async () => {
    const fake = (async () => new Response(JSON.stringify({ title: "Forbidden", detail: "duplicate" }), { status: 403 })) as unknown as typeof fetch;
    await expect(new XApiPoster("tok", undefined, fake).post("x")).rejects.toThrow(/403.*Forbidden/);
  });

  it("refuses to start without a token", () => {
    expect(() => new XApiPoster("")).toThrow(/X_ACCESS_TOKEN/);
  });
});
