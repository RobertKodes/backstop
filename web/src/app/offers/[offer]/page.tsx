import type { Metadata } from "next";

import { OfferView } from "@/components/views/offer-view";

export async function generateMetadata({ params }: { params: Promise<{ offer: string }> }): Promise<Metadata> {
  const { offer } = await params;
  return { title: `Offer ${offer.slice(0, 4)}…${offer.slice(-4)}` };
}

export default async function OfferPage({ params }: { params: Promise<{ offer: string }> }) {
  const { offer } = await params;
  return <OfferView offerKey={offer} />;
}
