import type { Metadata } from "next";

import { LaunchpadView } from "@/components/views/launchpad-view";

export const metadata: Metadata = {
  title: "Launchpad",
  description: "Launch a child token with locked liquidity, and review every child's risk facts.",
};

export default function LaunchpadPage() {
  return <LaunchpadView />;
}
