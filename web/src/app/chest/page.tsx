import type { Metadata } from "next";

import { ChestView } from "@/components/views/chest-view";

export const metadata: Metadata = {
  title: "My Chest",
  description: "Chest balance, variable yield, lock status and Auto-Absorb settings.",
};

export default function ChestPage() {
  return <ChestView />;
}
