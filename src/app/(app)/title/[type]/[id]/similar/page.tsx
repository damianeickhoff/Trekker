import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SimilarPage } from "@/components/title/similar-page";

export const metadata: Metadata = { title: "More like this" };

/** `/title/tv/1399/similar`: every recommendation TMDB gives for the title. */
export default async function Page({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  if ((type !== "tv" && type !== "movie") || !/^\d+$/.test(id)) notFound();
  return <SimilarPage mediaType={type} id={Number(id)} />;
}
