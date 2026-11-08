import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";

import { Providers } from "@/components/providers";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { themeInitScript } from "@/components/theme-toggle";

const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "BACKSTOP | Live offers", template: "%s | BACKSTOP" },
  description:
    "BACKSTOP is a Solana token where sellers offer to holders first: ten-minute public offers at a frozen discount, absorbed by chests and the Shield.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f3ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1a15" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Providers>
          <SiteHeader />
          <main id="main" tabIndex={-1} className="mx-auto max-w-[1240px] px-4 pt-6 outline-none md:px-6 md:pt-10">
            {children}
          </main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
