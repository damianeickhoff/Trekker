import { redirect } from "next/navigation";
import { marksFor } from "@/lib/home";
import { episodeCode, titleHref, titleKey } from "@/lib/marks";
import { requireUser } from "@/lib/title";
import { findPicks, type Pick } from "@/lib/what-to-watch";
import { todaySeed } from "@/lib/what-to-watch-picks";
import {
  RESULTS_PATH,
  answered,
  answersLine,
  questionHref,
  readAnswers,
  toQuery,
  QUIZ_PATH,
} from "@/lib/what-to-watch-quiz";
import { Icon } from "../icon";
import { Link } from "../link";
import { MobileTop } from "../page";
import { Poster } from "../poster";
import { Rail } from "../rail";
import { SectionHead } from "../section-head";
import { runtimeLabel } from "../title/film-page";
import { HeroArt, TitleLogo } from "../title/hero";
import { GLASS_46, WHITE_46 } from "../title/styles";
import { buttonClass, iconButtonClass, IconLink, StateChip } from "../ui";
import { EmptyNote } from "./parts";
import { PickCard } from "./tiles";

/*
 * Tonight's pick on its own dark hero, then the second and third choice and
 * the wildcard. "Not tonight" deals again without the one turned down, and
 * "Change answers" goes back to the last question with its answer still
 * chosen.
 */

const KEY = /^(movie|tv)-\d+$/;
/** Enough turned down to see a mood through; past it the oldest are forgotten. */
const REJECT_CAP = 20;

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

/** "Series · 8 × 58 min · HBO Max", "Film · 1 h 52 · On Plex". */
function metaOf(pick: Pick) {
  const length =
    pick.medium === "Series"
      ? pick.episodes && pick.runtime
        ? `${pick.episodes} × ${pick.runtime} min`
        : pick.runtime
          ? `${pick.runtime} min episodes`
          : null
      : runtimeLabel(pick.runtime);
  const where = pick.services[0] ?? (pick.onPlex ? "On Plex" : null);
  return [pick.medium, length, where].filter(Boolean).join(" · ");
}

export async function ResultsScreen({ search }: { search: Record<string, string | string[] | undefined> }) {
  const user = await requireUser();
  const read = readAnswers(search);
  const given = answered(read);
  // A hand-edited link or an old bookmark with a question unanswered: go and ask it.
  if (read.next !== null || !read.audience || !read.kind || !read.vibe || !read.time) {
    redirect(read.next ? questionHref(given, read.next) : QUIZ_PATH);
  }

  // The seed moves once a day, so the same answers on Friday and Saturday are
  // not the same evening; `roll` pins it, so coming back from a title page
  // shows the same picks.
  const roll = Number(one(search.roll));
  const seed = Number.isInteger(roll) && roll > 0 ? roll : todaySeed();
  const rejected = (one(search.not) ?? "").split(",").filter((k) => KEY.test(k)).slice(-REJECT_CAP);

  const picks = await findPicks(
    user.id,
    { audience: read.audience, vibe: read.vibe, kind: read.kind.value, time: read.time },
    seed,
    rejected,
  );
  const line = answersLine(read);
  const change = questionHref(given, "time", read.time.value);
  const anotherMood = questionHref(given, "vibe", read.vibe.value);
  const close = "/discover";

  const [first, ...others] = picks.top;
  if (!first) {
    return (
      <>
        <MobileTop title="What to watch" right={<IconLink href={close} icon="x" label="Close and go back to Discover" />} />
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-5 pt-2 lg:gap-7 lg:px-10 lg:pt-10">
          <div className="hidden items-center justify-between lg:flex">
            <h1 className="m-0 font-display text-[30px] font-bold leading-[1.05] tracking-[-0.025em]">What to watch</h1>
            <IconLink href={close} icon="x" label="Close and go back to Discover" />
          </div>
          <span className="mono-label text-accent-text!">{line}</span>
          <EmptyNote title="Nothing quite fit">
            <p className="m-0">
              That combination came back empty{rejected.length ? ", once the ones you turned down were left out" : ""}. Try a
              different mood, or give yourself a bit more time.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link href={anotherMood} className={buttonClass("primary", "sm")}>
                Pick another mood
              </Link>
              <Link href={QUIZ_PATH} className={buttonClass("ghost", "sm")}>
                Start over
              </Link>
            </div>
          </EmptyNote>
        </div>
      </>
    );
  }

  const rest = [...others.map((p, i) => ({ pick: p, label: i === 0 ? "Second choice" : "Third choice" }))];
  if (picks.wildcard) rest.push({ pick: picks.wildcard, label: "Wildcard" });
  const marks = await marksFor(rest.map((r) => ({ mediaType: r.pick.entry.item.mediaType, tmdbId: r.pick.entry.item.id })));

  const item = first.entry.item;
  const notTonight = `${RESULTS_PATH}?${toQuery(given, { roll: seed + 1, not: [...rejected, first.entry.key].join(",") })}`;
  const code = first.next ? episodeCode(first.next.season, first.next.episode) : null;
  const play = first.plexUrl
    ? { href: first.plexUrl, short: code ? `Play ${code}` : "Play", long: code ? `Play ${code} on Plex` : "Play on Plex" }
    : null;
  const details = titleHref(item.mediaType, item.id);
  const deskMeta = [
    metaOf(first),
    item.score > 0 ? `${item.score}%` : null,
    first.entry.partway ? `you are ${first.entry.partway} episode${first.entry.partway === 1 ? "" : "s"} in` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const logo = (
    <TitleLogo
      logo={picks.logo}
      title={item.title}
      className="w-full text-[30px]! [&_img]:max-w-full lg:text-[56px]!"
    />
  );
  const poster = (className: string, sizes: string) => (
    // The answer's poster reveals itself: from 0.96 and faded (`motion-reveal`).
    <Link href={details} aria-hidden="true" tabIndex={-1} className={`motion-reveal shrink-0 overflow-hidden leading-none ${className}`}>
      <Poster path={item.poster} alt="" title={item.title} width={240} height={360} sizes={sizes} priority className="size-full" />
    </Link>
  );

  return (
    <>
      {/* Phones */}
      <div className="relative flex min-h-[470px] flex-col lg:hidden">
        <HeroArt path={item.backdrop} />
        <header className="relative z-(--z-top-row) flex h-[60px] shrink-0 items-center justify-between px-5 pt-4">
          <Link href={change} aria-label="Change answers" className={iconButtonClass("glass", "sm")}>
            <Icon name="chevL" size={20} />
          </Link>
          <IconLink href={close} icon="x" kind="glass" label="Close and go back to Discover" />
        </header>
        <div className="relative z-(--z-lift) flex grow flex-col justify-end gap-2.5 px-5 pb-[18px] pt-3 text-white">
          <div className="flex items-end gap-4">
            {poster("h-[195px] w-[130px] rounded-xl shadow-[0_16px_40px_rgba(0,0,0,0.5)]", "(min-width: 64rem) 240px, 130px")}
            <div className="flex min-w-0 grow flex-col items-start gap-2">
              <StateChip small>Tonight&apos;s pick</StateChip>
              {logo}
              <span className="text-xs text-white/78">{line}</span>
            </div>
          </div>
          <p className="m-0 text-[13px] leading-[1.45] text-white/85">{first.reason}</p>
          <div className="flex gap-2">
            {play ? (
              <>
                <a href={play.href} target="_blank" rel="noreferrer" className={buttonClass("white", "md")}>
                  <Icon name="play" size={18} />
                  {play.short}
                </a>
                <Link href={details} className={buttonClass("glass", "md")}>
                  Details
                </Link>
              </>
            ) : (
              <Link href={details} className={buttonClass("white", "md")}>
                Details
              </Link>
            )}
            <Link href={notTonight} replace aria-label="Not tonight" className={iconButtonClass("glass", "md")}>
              <Icon name="shuffle" size={20} />
            </Link>
          </div>
        </div>
      </div>

      {/* Desktop */}
      <div className="relative hidden lg:block">
        <HeroArt path={item.backdrop} />
        <div className="relative z-(--z-lift) flex flex-col gap-8 px-10 pb-16 pt-9 text-white">
          <div className="flex items-center justify-between gap-6">
            <Link href={change} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white/80 hover:text-white">
              <Icon name="chevL" size={16} />
              Change answers
            </Link>
            <span className="truncate text-[13px] text-white/75">{line}</span>
            <IconLink href={close} icon="x" kind="glass" label="Close and go back to Discover" />
          </div>
          <div className="flex items-end gap-8">
            {poster("h-[360px] w-[240px] rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.5)]", "(min-width: 64rem) 240px, 130px")}
            <div className="flex max-w-[620px] min-w-0 flex-col items-start gap-3.5 pb-2">
              <StateChip>Tonight&apos;s pick</StateChip>
              {logo}
              <span className="text-sm text-white/80">{deskMeta}</span>
              <p className="m-0 text-[15px] leading-normal text-white/88">{first.reason}</p>
              <div className="flex flex-wrap gap-2.5">
                {play ? (
                  <>
                    <a href={play.href} target="_blank" rel="noreferrer" className={WHITE_46}>
                      <Icon name="play" size={18} />
                      {play.long}
                    </a>
                    <Link href={details} className={GLASS_46}>
                      Details
                    </Link>
                  </>
                ) : (
                  <Link href={details} className={WHITE_46}>
                    Details
                  </Link>
                )}
                <Link href={notTonight} replace className={GLASS_46}>
                  <Icon name="x" size={18} />
                  Not tonight
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6 px-5 pt-2 lg:px-10 lg:pt-0">
        {rest.length > 0 && (
          <section aria-labelledby="also" className="flex flex-col gap-3.5">
            <SectionHead id="also" title="Also worth a look" meta="second, third and a wildcard" />
            <Rail label="Also worth a look" className="gap-3! lg:gap-5!">
              {rest.map(({ pick, label }) => (
                <PickCard
                  key={pick.entry.key}
                  item={pick.entry.item}
                  label={label}
                  mark={marks[titleKey(pick.entry.item.mediaType, pick.entry.item.id)] ?? null}
                  meta={metaOf(pick)}
                  why={pick.reason}
                  className="w-[250px] lg:w-[360px]"
                  art="h-[150px] w-full lg:h-[216px]"
                  sizes="(min-width: 64rem) 360px, 250px"
                />
              ))}
            </Rail>
          </section>
        )}
        {picks.noProviders && (
          <p className="m-0 text-xs text-ink-3">
            Tell Trekker which services you pay for in{" "}
            <Link href="/settings/subscriptions" className="font-semibold text-ink-2 underline">
              Settings
            </Link>{" "}
            and what you can play tonight comes first.
          </p>
        )}
      </div>
    </>
  );
}
