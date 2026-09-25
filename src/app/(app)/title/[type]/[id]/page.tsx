import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FilmPage } from "@/components/title/film-page";
import { SeriesPage } from "@/components/title/series-page";
import { loadFilm, loadShow } from "@/lib/title";

type Params = Promise<{ type: string; id: string }>;

function parse(type: string, id: string) {
  if ((type !== "tv" && type !== "movie") || !/^\d+$/.test(id)) notFound();
  return { type, id: Number(id) } as const;
}

/** The title's own name in the tab, from the same cached read the page makes. */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { type, id } = await params;
  const t = parse(type, id);
  const loaded = t.type === "tv" ? await loadShow(t.id) : await loadFilm(t.id);
  const name = loaded ? ("name" in loaded.details ? loaded.details.name : loaded.details.title) : "Title";
  return { title: name };
}

/**
 * `/title/tv/1399`, `/title/movie/603`: TMDB's own media type and id, so a
 * link can be built from any TMDB result without a lookup. `?season=2` picks a
 * show's season.
 */
export default async function TitlePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ season?: string }>;
}) {
  const { type, id } = await params;
  const t = parse(type, id);
  if (t.type === "movie") return <FilmPage id={t.id} />;
  const { season } = await searchParams;
  const asked = season !== undefined && /^\d+$/.test(season) ? Number(season) : null;
  return <SeriesPage id={t.id} season={asked} />;
}
