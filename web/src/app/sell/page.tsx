import type { Metadata } from "next";

import { SellView } from "@/components/views/sell-view";

export const metadata: Metadata = {
  title: "Sell",
  description: "How selling BACKSTOP works: ten-minute offers to holders at a frozen discount.",
};

export default function SellPage() {
  return <SellView />;
}
