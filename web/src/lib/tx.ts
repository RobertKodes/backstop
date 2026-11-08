"use client";

import "./polyfills";

import { MarketClient } from "@backstop/sdk";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  ComputeBudgetProgram,
  type Connection,
  type Keypair,
  PublicKey,
  Transaction,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { useCallback } from "react";

import { useToasts } from "@/components/toasts";
import { useWalletDialog } from "@/components/wallet-dialog";

import type { MarketInfo } from "./market";

const DEFAULT_CU = 400_000;

type SdkWallet = NonNullable<ConstructorParameters<typeof MarketClient>[2]>;

/**
 * The SDK types its wallet as Anchor's NodeWallet (with a `payer` keypair).
 * Browser wallets have no keypair; the instruction builders only read
 * `publicKey`, so the adapter wallet is passed through as-is.
 */
export function asSdkWallet(w: {
  publicKey: PublicKey;
  signTransaction: unknown;
  signAllTransactions: unknown;
}): SdkWallet {
  return w as unknown as SdkWallet;
}

/** Ensure a compute-unit limit (hooked transfers are CU-heavy). */
export function withComputeBudget(ixs: TransactionInstruction[], units = DEFAULT_CU): TransactionInstruction[] {
  const has = ixs.some((ix) => ix.programId.equals(ComputeBudgetProgram.programId));
  return has ? ixs : [ComputeBudgetProgram.setComputeUnitLimit({ units }), ...ixs];
}

/** Turn wallet / RPC / program errors into a short actionable sentence. */
export function explainTxError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/reject|declin|denied|cancel/i.test(msg)) return "You declined the request in your wallet.";
  if (/blockhash not found|block height exceeded|expired/i.test(msg))
    return "The transaction expired before it landed. Try again.";
  if (/insufficient (funds|lamports)|0x1\b/i.test(msg))
    return "Not enough balance to cover this transaction and its fees.";
  if (/failed to fetch|network|ECONNREFUSED|fetch failed/i.test(msg))
    return "Could not reach the Solana RPC endpoint. Check your connection and try again.";
  if (/Account does not exist|could not find account/i.test(msg))
    return "A required on-chain account was not found on this cluster.";
  const custom = /custom program error: (0x[0-9a-f]+)/i.exec(msg);
  if (custom) return `The program rejected the transaction (error ${custom[1]}).`;
  return msg.length > 180 ? `${msg.slice(0, 177)}…` : msg;
}

export interface TxContext {
  client: MarketClient;
  owner: PublicKey;
  connection: Connection;
}

export interface SendOptions {
  /** Toast title while in progress, e.g. "Placing bid". */
  label: string;
  /** Toast title once confirmed, e.g. "Bid placed". */
  success: string;
  market: MarketInfo;
  build: (ctx: TxContext) => Promise<TransactionInstruction[]>;
  signers?: Keypair[];
}

async function sendAndConfirm(
  connection: Connection,
  wallet: ReturnType<typeof useWallet>,
  payer: PublicKey,
  ixs: TransactionInstruction[],
  signers: Keypair[],
  onSent: (sig: string) => void,
): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const supportsV0 = !wallet.wallet || wallet.wallet.adapter.supportedTransactionVersions?.has(0);
  let sig: string;
  if (supportsV0) {
    const msg = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions: ixs,
    }).compileToV0Message();
    const tx = new VersionedTransaction(msg);
    if (signers.length) tx.sign(signers);
    sig = await wallet.sendTransaction(tx, connection, { maxRetries: 3 });
  } else {
    const tx = new Transaction({ feePayer: payer, blockhash, lastValidBlockHeight }).add(...ixs);
    sig = await wallet.sendTransaction(tx, connection, { maxRetries: 3, signers });
  }
  onSent(sig);
  const res = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  if (res.value.err) throw new Error(`Transaction failed: ${JSON.stringify(res.value.err)}`);
  return sig;
}

/**
 * Build instructions with the SDK's MarketClient (constructed with the
 * connected wallet), send them as a v0 transaction (legacy fallback) and
 * report progress through toasts with explorer links.
 */
export function useSendTx() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const anchorWallet = useAnchorWallet();
  const { setVisible } = useWalletDialog();
  const toasts = useToasts();

  const send = useCallback(
    async ({ label, success, market, build, signers = [] }: SendOptions): Promise<string | null> => {
      if (!wallet.publicKey || !anchorWallet) {
        setVisible(true);
        return null;
      }
      const id = toasts.push({ kind: "pending", title: label, message: "Preparing the transaction…" });
      try {
        const client = new MarketClient(
          connection,
          { mint: new PublicKey(market.mint), quoteMint: new PublicKey(market.quoteMint) },
          asSdkWallet(anchorWallet),
        );
        const ixs = withComputeBudget(await build({ client, owner: wallet.publicKey, connection }));
        toasts.update(id, { message: "Approve the transaction in your wallet." });
        const sig = await sendAndConfirm(connection, wallet, wallet.publicKey, ixs, signers, (s) =>
          toasts.update(id, { message: "Sent. Waiting for confirmation…", signature: s }),
        );
        toasts.update(id, { kind: "success", title: success, message: undefined, signature: sig });
        return sig;
      } catch (e) {
        toasts.update(id, { kind: "error", title: `${label} did not complete`, message: explainTxError(e) });
        return null;
      }
    },
    [anchorWallet, connection, setVisible, toasts, wallet],
  );

  /** Like `send`, for instructions that do not come from a MarketClient (e.g. launchpad). */
  const sendIxs = useCallback(
    async ({
      label,
      success,
      build,
      signers = [],
    }: {
      label: string;
      success: string;
      build: (ctx: { owner: PublicKey; connection: Connection }) => Promise<TransactionInstruction[]>;
      signers?: Keypair[];
    }): Promise<string | null> => {
      if (!wallet.publicKey) {
        setVisible(true);
        return null;
      }
      const id = toasts.push({ kind: "pending", title: label, message: "Preparing the transaction…" });
      try {
        const ixs = withComputeBudget(await build({ owner: wallet.publicKey, connection }));
        toasts.update(id, { message: "Approve the transaction in your wallet." });
        const sig = await sendAndConfirm(connection, wallet, wallet.publicKey, ixs, signers, (s) =>
          toasts.update(id, { message: "Sent. Waiting for confirmation…", signature: s }),
        );
        toasts.update(id, { kind: "success", title: success, message: undefined, signature: sig });
        return sig;
      } catch (e) {
        toasts.update(id, { kind: "error", title: `${label} did not complete`, message: explainTxError(e) });
        return null;
      }
    },
    [connection, setVisible, toasts, wallet],
  );

  /** Send pre-built instruction batches in order (multi-step flows). */
  const sendRaw = useCallback(
    async (ixs: TransactionInstruction[], signers: Keypair[], onSent: (sig: string) => void) => {
      if (!wallet.publicKey) throw new Error("Connect a wallet first.");
      return sendAndConfirm(connection, wallet, wallet.publicKey, withComputeBudget(ixs), signers, onSent);
    },
    [connection, wallet],
  );

  return { send, sendIxs, sendRaw, connected: !!wallet.publicKey, openWalletModal: () => setVisible(true) };
}
