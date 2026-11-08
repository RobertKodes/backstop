import type { Metadata } from "next";

import { LeaderboardsView } from "@/components/views/leaderboards-view";

export const metadata: Metadata = {
  title: "Leaderboards",
  description: "Oldest bags, top absorbers and top Shield depositors.",
};

export default function LeaderboardsPage() {
  return <LeaderboardsView />;
}
