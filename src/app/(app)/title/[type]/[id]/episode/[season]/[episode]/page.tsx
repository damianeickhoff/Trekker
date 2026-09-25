import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EpisodePage } from "@/components/title/episode-page";
import { loadShow } from "@/lib/title";

type Params = Promise<{ type: string; id: string; season: string; episode: string }>;

function parse(p: Awaited<Params>) {
  if (p.type !== "tv" || ![p.id, p.season, p.episode].every((v) => /^\d+$/.test(v))) notFound();
  return { id: Number(p.id), season: Number(p.season), episode: Number(p.episode) };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id, season, episode } = parse(await params);
  const show = await loadShow(id);
  const code = `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
  return { title: show ? `${show.details.name} ${code}` : code };
}

/** `/title/tv/1399/episode/1/5`: an episode of a show, by its numbers. */
export default async function Page({ params }: { params: Params }) {
  const { id, season, episode } = parse(await params);
  return <EpisodePage id={id} season={season} episode={episode} />;
}
