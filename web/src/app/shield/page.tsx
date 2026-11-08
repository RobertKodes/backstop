import type { Metadata } from "next";

import { ShieldView } from "@/components/views/shield-view";

export const metadata: Metadata = {
  title: "Shield",
  description: "Lock chest USDC in the Shield, the pooled backstop that takes the first slice of every offer.",
};

export default function ShieldPage() {
  return <ShieldView />;
}
