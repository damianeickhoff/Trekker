import { dateParts, pastDay, todayKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { departmentNoun, filmographyFor, filterFilmography, loadPerson, type Filmography, type PersonFilter } from "@/lib/person";
import { isFollowing } from "@/lib/follow";
import { requireUser } from "@/lib/title";
import { TickMark } from "./artwork";
import { Back } from "./back-button";
import { FollowButton } from "./follow-button";
import { Link } from "./link";
import { Poster } from "./poster";
import { IconLink, StateChip, filterChipClass } from "./ui";
import { HeroArt } from "./title/hero";
import { PersonPhoto } from "./title/people";
import { Panel } from "./title/sections";
import { TitleUnavailable } from "./title/unavailable";
import { FILL, fillTo, ZOOM, ZOOM_GROUP, ZOOM_SHADOW } from "./motion";

/*
 * A person. The hero is the backdrop of what they are best known for, kept on
 * their `Person` row, and dark in both themes like every hero. Under it, how
 * much of their work this person has seen, and the work itself with a tick on
 * everything seen, filtered to the seen, the unseen or what is on their services.
 */

function born(birthday: string | null, deathday: string | null) {
  const long = (d: string) => {
    const p = dateParts(d);
    return `${p.day} ${p.month} ${p.year}`;
  };
  if (!birthday) return null;
  return deathday ? `${long(birthday)} – ${long(deathday)}` : `Born ${long(birthday)}`;
}

function SeenPanel({ film, total, big }: { film: Filmography; total: number; big: boolean }) {
  const pct = total ? Math.round((film.seen / total) * 100) : 0;
  const services = film.items.filter((i) => !i.seen && i.onMine).length;
  const last = film.lastSeen ? `Last seen in ${film.lastSeen.title} · ${pastDay(todayKey(film.lastSeen.at), todayKey())}` : "Nothing of theirs seen yet";
  return (
    <Panel className={`flex flex-col gap-2 ${big ? "p-4" : "px-4 py-3.5"}`}>
      <div className="flex items-baseline justify-between">
        <span className={`font-display font-bold tracking-[-0.02em] ${big ? "text-[17px]" : "text-base"}`}>
          {film.seen} of {total} titles seen
        </span>
        <span className="font-mono text-xs font-medium tracking-[0.05em] text-accent-text">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className={FILL} style={fillTo(pct)} />
      </div>
      <span className="text-xs text-ink-2">
        {last}
        {big && services ? ` · ${services} unseen on your services` : ""}
      </span>
    </Panel>
  );
}

export async function PersonPage({ id, filter }: { id: number; filter: PersonFilter }) {
  const user = await requireUser();
  const person = await loadPerson(id);
  if (!person) return <TitleUnavailable />;
  const [film, row, following] = await Promise.all([
    filmographyFor(user.id, person),
    db.person.findUnique({ where: { tmdbId: id }, select: { knownForBackdrop: true } }),
    isFollowing(user.id, id),
  ]);

  const total = film.items.length;
  const shown = filterFilmography(film.items, filter);
  const facts = [born(person.birthday, person.deathday), person.place_of_birth, departmentNoun(person.known_for_department)]
    .filter(Boolean)
    .join(" · ");
  const base = `/person/${id}`;
  const chips = (
    [
      ["all", "Everything"],
      ["seen", "Seen"],
      ["unseen", "Unseen"],
      ["services", "On your services"],
    ] as [PersonFilter, string][]
  ).map(([f, label]) => (
    <Link key={f} href={f === "all" ? base : `${base}?show=${f}`} replace scroll={false} className={filterChipClass(f === filter)}>
      {label}
    </Link>
  ));

  // The hero's top row: the way back top-left, search top-right. A person has
  // too many ways in (any cast, the search, an episode) for the page to know
  // the name of where the way back leads, so the desktop link says "Back".
  const topRow = (
    <>
      <Back href="/" name="Back" history onHero />
      <IconLink href="/search" icon="search" label="Search" kind="glass" />
    </>
  );

  // Portrait 128px wide on phones and 220px on desktop, 4:5 like every person.
  const header = (big: boolean) => (
    <div className={`flex min-w-0 ${big ? "items-end gap-7" : "items-end gap-4"}`}>
      <PersonPhoto
        id={id}
        name={person.name}
        path={person.profile_path}
        sizes={big ? "220px" : "128px"}
        text={big ? "text-[64px]" : "text-[40px]"}
        className={`shadow-[0_20px_50px_rgba(0,0,0,0.45)] ${big ? "w-[220px] rounded-[20px]" : "w-32 rounded-[14px]"}`}
      />
      <div className={`flex min-w-0 flex-col text-white ${big ? "gap-2.5" : "gap-1.5"}`}>
        <h1 className={`m-0 font-display font-extrabold leading-[0.95] tracking-[-0.035em] ${big ? "text-[52px]" : "text-[28px]"}`}>
          {person.name}
        </h1>
        {facts && <span className={`text-white/78 ${big ? "text-sm" : "text-xs"}`}>{facts}</span>}
        <div className="flex flex-wrap items-center gap-2">
          {total > 0 && (
            <StateChip small>
              Seen {film.seen} of {total}
            </StateChip>
          )}
          {film.knownFor.length > 0 && (
            <span className={`text-white/78 ${big ? "text-[13px]" : "text-xs"}`}>Known for {film.knownFor.join(", ")}</span>
          )}
        </div>
        <div className={big ? "pt-1.5" : "pt-1"}>
          <FollowButton personId={id} name={person.name} initial={following} size={big ? "md" : "sm"} />
        </div>
      </div>
    </div>
  );

  // Three across on phones; from `lg` the desktop poster width, the one More like this uses.
  const grid = (
    <div
      role="list"
      className="grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-4 lg:grid-cols-[repeat(auto-fill,var(--poster-desk))] lg:justify-between lg:gap-x-(--tile-gap) lg:gap-y-3.5"
    >
      {shown.map((i) => (
        <Link key={`${i.mediaType}-${i.tmdbId}`} href={`/title/${i.mediaType}/${i.tmdbId}`} role="listitem" className={`${ZOOM_GROUP} flex min-w-0 flex-col gap-1.5`}>
          <span className={`block rounded-[10px] ${ZOOM_SHADOW}`}>
          <span className="relative block aspect-[2/3] overflow-hidden rounded-[10px] shadow-elevation">
            <Poster
              path={i.poster}
              alt=""
              title={i.title}
              width={154}
              height={231}
              sizes="(min-width: 64rem) 93px, 33vw"
              className={`size-full ${ZOOM}`}
            />
            {i.seen && (
              <span className="absolute right-1.5 top-1.5 flex">
                <TickMark on onArt size={22} />
              </span>
            )}
          </span>
          </span>
          <span className="flex min-w-0 flex-col gap-px">
            <span className="truncate text-xs font-semibold">{i.title}</span>
            <span className="truncate text-[11px] text-ink-3">{[i.year ?? "Upcoming", i.role].filter(Boolean).join(" · ")}</span>
          </span>
        </Link>
      ))}
    </div>
  );
  const empty = (
    <p className="m-0 text-[13px] text-ink-2">
      {filter === "seen" ? "You have not seen anything of theirs yet." : filter === "unseen" ? "You have seen everything of theirs listed here." : filter === "services" ? "Nothing of theirs is on Plex or your services, as far as the daily check knows." : "TMDB lists no work for them yet."}
    </p>
  );

  return (
    <>
      {/* Phones: the hero is only as tall as its top row, the portrait and the name. */}
      <div className="lg:hidden">
        <div className="relative flex flex-col">
          <HeroArt path={row?.knownForBackdrop ?? null} />
          <header className="relative z-(--z-top-row) flex h-[60px] shrink-0 items-center justify-between px-5 pt-4">{topRow}</header>
          <div className="relative z-(--z-lift) px-5 pb-6 pt-3">{header(false)}</div>
        </div>
        <div className="flex flex-col gap-4 px-5 pt-1">
          <SeenPanel film={film} total={total} big={false} />
          {/* Vertical padding inside the scroller, so the pills' shadows are not clipped by it. */}
          <div className="no-scrollbar -mx-5 -my-2 flex gap-1.5 overflow-x-auto px-5 py-2">{chips}</div>
          <section aria-label="Filmography" className="flex flex-col gap-2.5">
            <div className="flex items-baseline gap-3">
              <h2 className="m-0 font-display text-xl font-bold tracking-[-0.025em]">Filmography</h2>
              <span className="mono-label">
                {shown.length} {shown.length === 1 ? "title" : "titles"}
              </span>
            </div>
            {shown.length ? grid : empty}
          </section>
          {person.biography && (
            <section aria-label="About" className="flex flex-col gap-2">
              <span className="mono-label">About</span>
              <p className="m-0 line-clamp-6 text-[13px] leading-normal text-ink-2">{person.biography}</p>
            </section>
          )}
        </div>
      </div>

      {/* Desktop: the same top row above the header, then the header on the artwork. */}
      <div className="hidden flex-col gap-7 lg:flex">
        <div className="relative flex flex-col gap-6 px-10 pb-12 pt-7">
          <HeroArt path={row?.knownForBackdrop ?? null} />
          <div className="relative flex items-center justify-between">{topRow}</div>
          <div className="relative">{header(true)}</div>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-10 px-10 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section aria-label="Filmography" className="flex min-w-0 flex-col gap-3.5">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="m-0 font-display text-[22px] font-bold tracking-[-0.025em]">Filmography</h2>
              <span className="mono-label">
                {shown.length} {shown.length === 1 ? "title" : "titles"} · newest first
              </span>
              <span className="grow" />
              <div className="flex gap-1.5">{chips}</div>
            </div>
            {shown.length ? grid : empty}
          </section>
          <div className="flex flex-col gap-4">
            <SeenPanel film={film} total={total} big />
            {person.biography && (
              <section aria-label="About" className="flex flex-col gap-2">
                <span className="mono-label">About</span>
                <p className="m-0 line-clamp-[12] text-[13px] leading-normal text-ink-2">{person.biography}</p>
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
