"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useId, useRef, useState } from "react";

import { explorerAddress } from "@/lib/config";
import { shortAddress } from "@/lib/format";

import { useWalletDialog } from "./wallet-dialog";

export function ConnectButton() {
  const { publicKey, wallet, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletDialog();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!publicKey) {
    return (
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => setVisible(true)}
        data-testid="connect-wallet"
      >
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  const addr = publicKey.toBase58();
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="btn btn-sm"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        data-testid="wallet-menu"
      >
        {wallet?.adapter.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={wallet.adapter.icon} alt="" width={18} height={18} />
        ) : null}
        <span className="sr-only">Wallet </span>
        {shortAddress(addr)}
      </button>
      {open ? (
        <div id={menuId} className="panel absolute right-0 z-50 mt-2 grid w-60 gap-1 !p-2 shadow-lg">
          <p className="px-2 py-1 text-sm text-muted break-all">{addr}</p>
          <button
            type="button"
            className="btn btn-sm justify-start border-0"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(addr);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              } catch {
                /* clipboard unavailable */
              }
            }}
          >
            {copied ? "Copied" : "Copy address"}
          </button>
          <a
            className="btn btn-sm justify-start border-0"
            href={explorerAddress(addr)}
            target="_blank"
            rel="noreferrer"
          >
            View on explorer<span className="sr-only"> (opens in a new tab)</span>
          </a>
          <button
            type="button"
            className="btn btn-sm justify-start border-0"
            onClick={() => {
              setOpen(false);
              setVisible(true);
            }}
          >
            Change wallet
          </button>
          <button
            type="button"
            className="btn btn-sm justify-start border-0 text-red"
            onClick={() => {
              setOpen(false);
              void disconnect();
            }}
          >
            Disconnect
          </button>
        </div>
      ) : null}
    </div>
  );
}
