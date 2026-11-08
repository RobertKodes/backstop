"use client";

// Accessible wallet picker built on the native <dialog> element (focus
// trapping, Escape to close, inert background). It replaces the
// wallet-adapter-react-ui modal, whose markup fails WCAG checks (unnamed close
// button, invalid list structure). Wallets come from the wallet adapter:
// Phantom and Solflare adapters plus every Wallet Standard wallet (Backpack…).

import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";

interface DialogApi {
  visible: boolean;
  setVisible: (v: boolean) => void;
}

const Ctx = createContext<DialogApi | null>(null);

export function useWalletDialog(): DialogApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWalletDialog outside WalletDialogProvider");
  return v;
}

export function WalletDialogProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const api = useMemo(() => ({ visible, setVisible }), [visible]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <WalletDialog open={visible} onClose={() => setVisible(false)} />
    </Ctx.Provider>
  );
}

function WalletDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { wallets, select } = useWallet();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const choose = useCallback(
    (name: Parameters<typeof select>[0]) => {
      select(name); // autoConnect connects once a wallet is selected
      onClose();
    },
    [onClose, select],
  );

  const detected = wallets.filter(
    (w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable,
  );
  const install = wallets.filter((w) => w.readyState === WalletReadyState.NotDetected);

  return (
    <dialog
      ref={ref}
      className="wallet-dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {/* Contents render only while open: wallet detection differs between server and client. */}
      {open ? (
        <div className="grid gap-5 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id={titleId} className="section-title">
              Connect a wallet
            </h2>
            <button type="button" className="icon-btn -mr-2 -mt-1" onClick={onClose} aria-label="Close">
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          {detected.length ? (
            <ul className="grid gap-2" aria-label="Wallets found in this browser">
              {detected.map((w) => (
                <li key={w.adapter.name}>
                  <button type="button" className="wallet-option" onClick={() => choose(w.adapter.name)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={w.adapter.icon} alt="" width={28} height={28} />
                    <span className="flex-1 text-left font-semibold">{w.adapter.name}</span>
                    <span className="text-sm text-muted">Detected</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="note">
              No Solana wallet was found in this browser. Install one below, then reload this page.
            </p>
          )}
          {install.length ? (
            <div className="grid gap-2">
              <h3 className="label text-sm">Not installed</h3>
              <ul className="grid gap-2">
                {install.map((w) => (
                  <li key={w.adapter.name}>
                    <a className="wallet-option" href={w.adapter.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={w.adapter.icon} alt="" width={28} height={28} />
                      <span className="flex-1 font-semibold">Install {w.adapter.name}</span>
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-sm text-muted">
            Backpack and other Wallet Standard wallets appear here automatically once installed. Wallets whose vault is
            a program account (for example multisigs) cannot receive BACKSTOP unless governance allows them.
          </p>
        </div>
      ) : null}
    </dialog>
  );
}
