import type { Metadata } from "next";

import { TreasuryView } from "@/components/views/treasury-view";

export const metadata: Metadata = {
  title: "Treasury",
  description: "SOL held by the treasury, the floor price per token, and redemptions.",
};

export default function TreasuryPage() {
  return <TreasuryView />;
}
