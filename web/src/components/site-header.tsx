"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useLiveStatus } from "@/lib/live";

import { ConnectButton } from "./connect-button";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { href: "/", label: "Live" },
  { href: "/sell", label: "Sell" },
  { href: "/chest", label: "My Chest" },
  { href: "/shield", label: "Shield" },
  { href: "/treasury", label: "Treasury" },
  { href: "/leaderboards", label: "Leaderboards" },
  { href: "/launchpad", label: "Launchpad" },
  { href: "/agent", label: "Agent" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/offers");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Logo() {
  return (
    <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true" className="text-brass">
      <path d="M14 3v13" stroke="currentColor" strokeWidth="3" strokeLinecap="square" />
      <path d="M8.5 11.5L14 17l5.5-5.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" />
      <rect x="3" y="21" width="22" height="4" fill="currentColor" />
    </svg>
  );
}

function LiveIndicator() {
  const status = useLiveStatus();
  if (status === "idle") return null;
  const label = status === "live" ? "Live" : status === "connecting" ? "Connecting" : "Polling";
  const title =
    status === "live"
      ? "Live updates connected"
      : status === "connecting"
        ? "Connecting to live updates"
        : "Live updates unavailable; refreshing periodically";
  return (
    <span
      className="hidden items-center gap-2 text-sm text-muted sm:inline-flex"
      title={title}
      data-testid="live-status"
      data-status={status}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-2 w-2 rounded-full ${status === "live" ? "bg-green" : status === "connecting" ? "bg-brass-fill" : "bg-line-strong"}`}
      />
      <span>
        <span className="sr-only">Connection: </span>
        {label}
      </span>
    </span>
  );
}

export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  return (
    <header className="border-b border-line bg-bg/95 backdrop-blur supports-[backdrop-filter]:bg-bg/80 sticky top-0 z-40">
      <div className="mx-auto flex max-w-[1240px] items-center gap-3 px-4 pt-3 md:px-6 md:pt-0 md:h-16">
        <Link href="/" className="flex items-center gap-2 rounded-sm" aria-label="BACKSTOP home">
          <Logo />
          <span className="display text-[1.5rem] leading-none tracking-[0.02em]">BACKSTOP</span>
        </Link>
        <nav aria-label="Main" className="hidden flex-1 md:block">
          <ul className="flex items-center gap-1 pl-4">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  className="nav-link h-16"
                  aria-current={isActive(pathname, n.href) ? "page" : undefined}
                >
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <LiveIndicator />
          <ThemeToggle />
          <ConnectButton />
        </div>
      </div>
      <nav aria-label="Main (compact)" className="md:hidden">
        <ul className="flex gap-1 overflow-x-auto px-2 pb-0.5">
          {NAV.map((n) => (
            <li key={n.href}>
              <Link href={n.href} className="nav-link" aria-current={isActive(pathname, n.href) ? "page" : undefined}>
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto grid max-w-[1240px] gap-3 px-4 py-8 text-sm text-muted md:grid-cols-[1fr_auto] md:px-6">
        <p className="max-w-[70ch]">
          BACKSTOP is a token with an unusual exit mechanic: sellers offer tokens to holders at a discount before
          anything reaches the market. Prices move in both directions, rates are variable, and nothing on this site is
          financial advice.
        </p>
        <p>
          <Link className="link" href="/treasury">
            Treasury
          </Link>{" "}
          <span aria-hidden="true">/</span>{" "}
          <Link className="link" href="/agent">
            Agent decisions
          </Link>
        </p>
      </div>
    </footer>
  );
}
