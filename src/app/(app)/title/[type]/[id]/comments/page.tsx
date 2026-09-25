import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CommentsPage } from "@/components/title/similar-page";

export const metadata: Metadata = { title: "Comments" };

/** `/title/tv/1399/comments`: every comment on the title, and the box to add one. */
export default async function Page({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  if ((type !== "tv" && type !== "movie") || !/^\d+$/.test(id)) notFound();
  return <CommentsPage mediaType={type} id={Number(id)} />;
}
