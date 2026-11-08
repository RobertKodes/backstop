"use client";

import "@/lib/polyfills";

import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { useMemo } from "react";

import { config } from "@/lib/config";

import { ToastProvider } from "./toasts";
import { WalletDialogProvider } from "./wallet-dialog";

export function Providers({ children }: { children: React.ReactNode }) {
  // Backpack (and any other Wallet Standard wallet) is detected automatically;
  // Phantom and Solflare are listed explicitly so they appear even when not installed.
  const wallets = useMemo(() => {
    const network = config.cluster === "mainnet-beta" ? WalletAdapterNetwork.Mainnet : WalletAdapterNetwork.Devnet;
    return [new PhantomWalletAdapter(), new SolflareWalletAdapter({ network })];
  }, []);

  return (
    <ConnectionProvider endpoint={config.rpcUrl} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletDialogProvider>
          <ToastProvider>{children}</ToastProvider>
        </WalletDialogProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
