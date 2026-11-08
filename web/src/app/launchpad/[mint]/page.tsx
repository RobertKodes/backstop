import type { Metadata } from "next";

import { ChildView } from "@/components/views/child-view";

export const metadata: Metadata = { title: "Child token" };

export default async function ChildPage({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  return <ChildView mint={mint} />;
}
