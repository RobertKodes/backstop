// Minimal Jupiter v6 client for keeper fee conversions. The keeper fetches a
// quote + swap instructions off-chain and passes the route accounts/data to
// `backstop_core::convert_*`, which CPIs Jupiter and enforces an oracle-bounded
// minimum output on-chain (see THREAT_MODEL.md "Jupiter route poisoning").

import { type AccountMeta, PublicKey } from "@solana/web3.js";

export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: unknown[];
}

interface RawIx {
  programId: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: string;
}

export interface JupiterRoute {
  quote: JupiterQuote;
  /** Accounts of the Jupiter swap instruction (pass as remaining accounts). */
  accounts: AccountMeta[];
  /** Raw instruction data (pass as `swap_data`). */
  data: Buffer;
  /** Address lookup tables the route needs. */
  lookupTables: PublicKey[];
}

export class JupiterClient {
  constructor(
    private readonly base = "https://lite-api.jup.ag/swap/v1",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async quote(inputMint: PublicKey, outputMint: PublicKey, amount: bigint, slippageBps: number): Promise<JupiterQuote> {
    const url = `${this.base}/quote?inputMint=${inputMint.toBase58()}&outputMint=${outputMint.toBase58()}&amount=${amount}&slippageBps=${slippageBps}&onlyDirectRoutes=false&restrictIntermediateTokens=true`;
    const res = await this.fetchImpl(url);
    if (!res.ok) throw new Error(`jupiter quote ${res.status}: ${await res.text()}`);
    return (await res.json()) as JupiterQuote;
  }

  /**
   * Swap instructions for a route where `owner` (a program PDA) holds the
   * input tokens and receives the output into `destination`.
   */
  async route(quote: JupiterQuote, owner: PublicKey, destination: PublicKey): Promise<JupiterRoute> {
    const res = await this.fetchImpl(`${this.base}/swap-instructions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: owner.toBase58(),
        destinationTokenAccount: destination.toBase58(),
        wrapAndUnwrapSol: false,
        useSharedAccounts: true,
        dynamicComputeUnitLimit: true,
      }),
    });
    if (!res.ok) throw new Error(`jupiter swap-instructions ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { swapInstruction: RawIx; addressLookupTableAddresses: string[] };
    const ix = body.swapInstruction;
    return {
      quote,
      accounts: ix.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: false, isWritable: a.isWritable })),
      data: Buffer.from(ix.data, "base64"),
      lookupTables: body.addressLookupTableAddresses.map((a) => new PublicKey(a)),
    };
  }
}
