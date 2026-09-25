import { mapLimit } from "@/lib/concurrency";
import { loadFilm, loadShow, numberedSeasons, requireUser } from "@/lib/title";
import { getAggregateCredits, getSeason, type CrewMember, type TitleLogo as TitleLogoData } from "@/lib/tmdb";
import { Back } from "../back-button";
import { Link } from "../link";
import { Poster } from "../poster";
import { SectionHead } from "../section-head";
import { filterChipClass } from "../ui";
import { TitleLogo } from "./hero";
import { PersonTile, type PersonCard } from "./people";
import { TitleUnavailable } from "./unavailable";

/*
 * Everyone in a title: cast, crew, and for a show its guest stars, each a
 * filter. A show's cast and crew come from TMDB's aggregate credits, which
 * count episodes; its guest stars from the seasons, which is where TMDB keeps
 * them. All through the cache.
 */

export type CastFilter = "cast" | "crew" | "guests";

/** The crew worth a tile: who made it, not who catered it. */
const FILM_JOBS = ["Director", "Screenplay", "Writer", "Story", "Novel", "Producer", "Original Music Composer", "Director of Photography"];

function filmCrew(crew: CrewMember[]): PersonCard[] {
  const out = new Map<number, PersonCard>();
  for (const job of FILM_JOBS) {
    for (const c of crew.filter((x) => x.job === job)) {
      const known = out.get(c.id);
      if (known) known.role = `${known.role}, ${job}`;
      else out.set(c.id, { id: c.id, name: c.name, role: job, profile: c.profile_path });
    }
  }
  return [...out.values()];
}

const episodes = (n: number) => `${n} ${n === 1 ? "episode" : "episodes"}`;

type People = {
  name: string;
  poster: string | null;
  logo: TitleLogoData | null;
  cast: PersonCard[];
  crew: PersonCard[];
  guests: PersonCard[];
};

async function showPeople(id: number): Promise<People | null> {
  const show = await loadShow(id);
  if (!show) return null;
  const [credits, seasons] = await Promise.all([
    getAggregateCredits(id).catch(() => null),
    mapLimit(numberedSeasons(show.details), 4, (s) => getSeason(id, s.season_number).catch(() => null)),
  ]);

  // Guest stars are per episode in TMDB, so they are counted across the
  // seasons. The aggregate credits list them too, so anyone who only ever
  // guested, and is not in the current regular cast, is taken out of Cast and
  // shown under Guest stars instead.
  const regulars = new Set((show.details.credits?.cast ?? []).map((c) => c.id));
  const counted = new Map<number, PersonCard & { n: number }>();
  for (const season of seasons) {
    for (const e of season?.episodes ?? []) {
      for (const g of e.guest_stars ?? []) {
        if (regulars.has(g.id)) continue;
        const known = counted.get(g.id);
        if (known) known.n += 1;
        else counted.set(g.id, { id: g.id, name: g.name, role: g.character, profile: g.profile_path, n: 1 });
      }
    }
  }
  const guests = [...counted.values()]
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
    .map(({ n, ...p }) => ({ ...p, extra: episodes(n) }));

  const cast: PersonCard[] = (credits?.cast ?? []).filter((c) => !counted.has(c.id)).map((c) => ({
    id: c.id,
    name: c.name,
    role: c.roles
      .map((r) => r.character)
      .filter(Boolean)
      .slice(0, 2)
      .join(", "),
    profile: c.profile_path,
    extra: episodes(c.total_episode_count),
  }));

  const creators: PersonCard[] = (show.details.created_by ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    role: "Creator",
    profile: c.profile_path,
  }));
  const makers: PersonCard[] = (credits?.crew ?? [])
    .filter((c) => c.department === "Directing" || c.department === "Writing")
    .filter((c) => !creators.some((x) => x.id === c.id))
    .sort((a, b) => b.total_episode_count - a.total_episode_count)
    .slice(0, 24)
    .map((c) => ({
      id: c.id,
      name: c.name,
      role: c.jobs[0]?.job ?? c.department,
      profile: c.profile_path,
      extra: episodes(c.total_episode_count),
    }));

  return {
    name: show.details.name,
    poster: show.details.poster_path,
    logo: show.logo,
    cast,
    crew: [...creators, ...makers],
    guests,
  };
}

async function filmPeople(id: number): Promise<People | null> {
  const film = await loadFilm(id);
  if (!film) return null;
  const cast: PersonCard[] = (film.details.credits?.cast ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    role: c.character,
    profile: c.profile_path,
  }));
  return {
    name: film.details.title,
    poster: film.details.poster_path,
    logo: film.logo,
    cast,
    crew: filmCrew(film.details.credits?.crew ?? []),
    guests: [],
  };
}

function Grid({ people }: { people: PersonCard[] }) {
  return (
    <div role="list" className="grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-4 lg:grid-cols-6 lg:gap-x-3.5 lg:gap-y-4 xl:grid-cols-8">
      {people.map((p) => (
        <PersonTile
          key={`${p.id}-${p.role}`}
          person={p}
          className="w-full"
          sizes="(min-width: 80rem) 130px, (min-width: 64rem) 140px, 33vw"
        />
      ))}
    </div>
  );
}

export async function CastPage({ mediaType, id, filter }: { mediaType: "movie" | "tv"; id: number; filter: CastFilter }) {
  await requireUser();
  const data = mediaType === "tv" ? await showPeople(id) : await filmPeople(id);
  if (!data) return <TitleUnavailable />;

  const filters: [CastFilter, string][] = [["cast", "Cast"], ["crew", "Crew"]];
  if (data.guests.length) filters.push(["guests", "Guest stars"]);
  const summary = [
    `${data.cast.length} cast`,
    `${data.crew.length} crew`,
    data.guests.length ? `${data.guests.length} guest stars` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const shown = filter === "crew" ? data.crew : filter === "guests" ? data.guests : data.cast;
  const base = `/title/${mediaType}/${id}`;
  const chips = filters.map(([f, label]) => (
    <Link
      key={f}
      href={f === "cast" ? `${base}/cast` : `${base}/cast?f=${f}`}
      replace
      scroll={false}
      className={filterChipClass(f === filter)}
    >
      {label}
    </Link>
  ));

  return (
    <div className="flex flex-col gap-4 px-5 lg:gap-6 lg:px-10 lg:pt-7">
      {/*
        The way back alone on the top row, then "Cast", as BackHeader has it.
        The title's poster and name follow on phones; on desktop the count and
        the filters share the title's row.
      */}
      <header className="flex flex-col gap-2 lg:gap-4">
        <div className="flex h-[66px] items-center pt-[22px] lg:h-auto lg:pt-0">
          <Back href={base} name={data.name} history />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="m-0 font-display text-[26px] font-extrabold leading-[1.05] tracking-[-0.035em] lg:text-[30px] lg:font-bold lg:tracking-[-0.025em]">
            Cast
          </h1>
          <span className="mono-label hidden lg:inline">
            {data.name} · {summary}
          </span>
          <span className="hidden grow lg:block" />
          <div className="hidden gap-1.5 lg:flex">{chips}</div>
        </div>
      </header>
      <div className="flex items-center gap-3 lg:hidden">
        <Poster path={data.poster} alt="" title={data.name} width={40} height={60} sizes="40px" className="h-[60px] w-10 rounded-md" />
        <span className="flex min-w-0 flex-col gap-1">
          <TitleLogo logo={data.logo} title={data.name} size="small" />
          <span className="mono-label">{summary}</span>
        </span>
      </div>
      <div className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5 lg:hidden">{chips}</div>

      {shown.length ? <Grid people={shown} /> : <p className="m-0 text-[13px] text-ink-2">TMDB lists nobody here yet.</p>}

      {filter === "cast" && data.crew.length > 0 && (
        <section aria-label="Crew" className="hidden flex-col gap-3 lg:flex">
          <SectionHead title="Crew" meta={`${data.crew.length} ${data.crew.length === 1 ? "person" : "people"}`} />
          <Grid people={data.crew} />
        </section>
      )}
    </div>
  );
}
