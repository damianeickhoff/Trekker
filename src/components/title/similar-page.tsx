import { marksFor } from "@/lib/home";
import { titleKey } from "@/lib/marks";
import { commentsFor } from "@/lib/social";
import { loadFilm, loadShow, requireUser } from "@/lib/title";
import { Back } from "../back-button";
import { BackHeader } from "../page";
import { recommendations, RecommendationTile } from "./sections";
import { Comments } from "./social";
import { SIMILAR_GRID } from "./styles";
import { TitleUnavailable } from "./unavailable";

/*
 * The two pages a title page's section chevrons lead to: every recommendation
 * TMDB gives for the title, and every comment on it. Both read the same cached
 * details the title page did, so opening one costs no request of its own.
 */

async function titleOf(mediaType: "movie" | "tv", id: number) {
  if (mediaType === "tv") {
    const show = await loadShow(id);
    return show ? { name: show.details.name, results: show.details.recommendations?.results ?? [] } : null;
  }
  const film = await loadFilm(id);
  return film ? { name: film.details.title, results: film.details.recommendations?.results ?? [] } : null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** More like this, all of it: the same tiles, in a grid at the desktop poster width. */
export async function SimilarPage({ mediaType, id }: { mediaType: "movie" | "tv"; id: number }) {
  await requireUser();
  const title = await titleOf(mediaType, id);
  if (!title) return <TitleUnavailable />;
  const list = recommendations(title.results, mediaType);
  const marks = await marksFor(list.map((i) => ({ mediaType: i.mediaType, tmdbId: i.id })));

  return (
    <div className="flex flex-col gap-5 px-5 lg:gap-6 lg:px-10 lg:pt-7">
      <BackHeader
        back={<Back href={`/title/${mediaType}/${id}`} name={title.name} history />}
        title="More like this"
        meta={<span className="mono-label">{`${title.name} · ${plural(list.length, "title")}`}</span>}
      />
      {list.length ? (
        <div role="list" aria-label="More like this" className={SIMILAR_GRID}>
          {list.map((i) => (
            <RecommendationTile
              key={`${i.mediaType}-${i.id}`}
              item={i}
              mark={marks[titleKey(i.mediaType, i.id)] ?? null}
              className="w-full"
              sizes="(min-width: 64rem) 93px, 33vw"
            />
          ))}
        </div>
      ) : (
        <p className="m-0 text-[13px] text-ink-2">TMDB has no recommendations for this one yet.</p>
      )}
    </div>
  );
}

/** Every comment on a title, oldest first as on the title page, with the box to add one. */
export async function CommentsPage({ mediaType, id }: { mediaType: "movie" | "tv"; id: number }) {
  const user = await requireUser();
  const [title, items] = await Promise.all([titleOf(mediaType, id), commentsFor(user.id, mediaType, id)]);
  if (!title) return <TitleUnavailable />;

  return (
    <div className="flex flex-col gap-5 px-5 lg:max-w-[720px] lg:gap-6 lg:px-10 lg:pt-7">
      <BackHeader
        back={<Back href={`/title/${mediaType}/${id}`} name={title.name} history />}
        title="Comments"
        meta={<span className="mono-label">{`${title.name} · ${plural(items.length, "comment")}`}</span>}
      />
      <Comments where={{ mediaType, tmdbId: id }} items={items} shown={Infinity} />
    </div>
  );
}
