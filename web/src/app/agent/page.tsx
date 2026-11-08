import type { Metadata } from "next";

import { AgentView } from "@/components/views/agent-view";

export const metadata: Metadata = { title: "Agent", description: "Recent posts and decisions of the treasury agent." };

export default function AgentPage() {
  return <AgentView />;
}
