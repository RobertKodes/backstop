// Public runtime configuration (inlined at build time by Next.js).

export type Cluster = "localnet" | "devnet" | "mainnet-beta";

const clusters: Cluster[] = ["localnet", "devnet", "mainnet-beta"];

function cluster(v: string | undefined): Cluster {
  return clusters.includes(v as Cluster) ? (v as Cluster) : "localnet";
}

const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787").replace(/\/+$/, "");

export const config = {
  apiUrl,
  wsUrl: `${apiUrl.replace(/^http/, "ws")}/v1/ws`,
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8899",
  cluster: cluster(process.env.NEXT_PUBLIC_CLUSTER),
  /** BACKSTOP mint; when empty the app uses the root market from /v1/markets. */
  mint: process.env.NEXT_PUBLIC_MINT || "",
  quoteMint: process.env.NEXT_PUBLIC_QUOTE_MINT || "",
  solPriceUrl:
    process.env.NEXT_PUBLIC_SOL_PRICE_URL ??
    "https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112",
} as const;

function clusterQuery(): string {
  if (config.cluster === "mainnet-beta") return "";
  if (config.cluster === "devnet") return "?cluster=devnet";
  return `?cluster=custom&customUrl=${encodeURIComponent(config.rpcUrl)}`;
}

export function explorerTx(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}${clusterQuery()}`;
}

export function explorerAddress(address: string): string {
  return `https://explorer.solana.com/address/${address}${clusterQuery()}`;
}
