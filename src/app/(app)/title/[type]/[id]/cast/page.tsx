import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CastPage, type CastFilter } from "@/components/title/cast-page";

export const metadata: Metadata = { title: "Cast and crew" };

/** `/title/tv/1399/cast`, with `?f=crew` or, for a show, `?f=guests` for the other lists. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ type: string; id: string }>;
  searchParams: Promise<{ f?: string }>;
}) {
  const { type, id } = await params;
  if ((type !== "tv" && type !== "movie") || !/^\d+$/.test(id)) notFound();
  const { f } = await searchParams;
  const filter: CastFilter = f === "crew" ? "crew" : f === "guests" && type === "tv" ? "guests" : "cast";
  return <CastPage mediaType={type} id={Number(id)} filter={filter} />;
}
