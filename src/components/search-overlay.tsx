"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Bookmark, Clock, Loader2, Search, Tv, Film, User as UserIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
// Not from "@/lib/tmdb" — that module is server-only; the URL builders live
// apart precisely so client components can use them.
import { img } from "@/lib/images";
import { FLOATING_MATERIAL } from "./back-button";

type Title = {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  year: string | null;
  poster: string | null;
  score: number;
};

type Person = { id: string; name: string; avatar: string | null; isFriend: boolean };

/** An actor or crew member on TMDB, as opposed to a user of this instance. */
type Cast = {
  id: number;
  name: string;
  profile: string | null;
  department: string | null;
  knownFor: string;
};

/** Something already on your own shelves — watched, rated, listed, saved. */
type Library = {
  key: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  poster: string | null;
  notes: string[];
  listId?: string;
};

type Payload = { results: Title[]; people: Person[]; cast: Cast[]; library: Library[] };

/** One flat list so arrow keys walk every kind of row without special cases. */
type Row =
  | { kind: "library"; key: string; item: Library }
  | { kind: "person"; key: string; person: Person }
  | { kind: "cast"; key: string; cast: Cast }
  | { kind: "title"; key: string; title: Title };

/**
 * Where the panel sits. `top` is the header's search on a desktop-sized window:
 * a dialog dropped from the top of the viewport. `bottom` is the phone's, opened
 * from the tab bar — the field sits just above the bar it was opened from, where
 * the thumb already is, and the matches stack upwards out of it.
 */
type Anchor = "top" | "bottom";

/**
 * Second-line text: what a row is, what year, what it scored, and the field's
 * own prompt.
 *
 * A dilute white rather than a step down the ink ramp. The ramp's greys are
 * violet-tinted and were mixed for a solid panel; on glass, over whatever the
 * page happens to be showing, they read as switched-off next to the white above
 * them. Thinning the same white instead keeps the two lines related — one is
 * simply quieter than the other. `light:` goes back to the ramp, since a
 * translucent white on paper is nothing at all.
 */
const SUBTLE = "text-white/70 light:text-ink-300";

/**
 * Quick search from the header: type, see matches immediately, hit enter to
 * jump to the first one or open the full results page.
 */
export function SearchOverlay({
  onClose,
  anchor = "top",
}: {
  onClose: () => void;
  anchor?: Anchor;
}) {
  const [query, setQuery] = useState("");
  // Results are stored with the query they belong to, so "is this stale?" is a
  // derived question rather than another piece of state to keep in sync.
  const [data, setData] = useState<({ query: string } & Payload) | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    inputRef.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const trimmed = query.trim();
  const ready = data?.query === trimmed;
  const loading = trimmed.length >= 2 && !ready;

  // People first: there are at most a handful, and someone typing a name is
  // looking for the person, not a show that happens to share a word with them.
  // Titles come next, then actors — a name and a title are hard to tell apart
  // from the query alone, and putting cast last means searching for "Dune" is
  // never answered with an actor before the film.
  const rows: Row[] = ready
    ? [
        // Your own library first. When somebody types the name of something
        // they have watched, that is the highest-confidence answer on the page
        // — and it is the only bucket that answers without TMDB.
        ...data.library.map((item) => ({
          kind: "library" as const,
          key: `library-${item.key}`,
          item,
        })),
        ...data.people.map((person) => ({
          kind: "person" as const,
          key: `person-${person.id}`,
          person,
        })),
        ...data.results.map((title) => ({
          kind: "title" as const,
          key: `${title.mediaType}-${title.id}`,
          title,
        })),
        ...data.cast.map((cast) => ({
          kind: "cast" as const,
          key: `cast-${cast.id}`,
          cast,
        })),
      ]
    : [];

  useEffect(() => {
    const search = query.trim();
    if (search.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(search)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((payload: Payload) => {
          setData({
            query: search,
            results: payload.results,
            people: payload.people ?? [],
            cast: payload.cast ?? [],
            library: payload.library ?? [],
          });
          setActive(0);
        })
        .catch(() => undefined);
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function go(row: Row) {
    onClose();

    if (row.kind === "library") {
      router.push(
        row.item.listId
          ? `/watchlist/list/${row.item.listId}`
          : `/title/${row.item.mediaType}/${row.item.tmdbId}`,
      );
    } else if (row.kind === "person") router.push(`/profiles/${row.person.id}`);
    else if (row.kind === "cast") router.push(`/person/${row.cast.id}`);
    else router.push(`/title/${row.title.mediaType}/${row.title.id}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") return onClose();

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (rows[active]) go(rows[active]);
      else if (query.trim()) {
        onClose();
        router.push(`/discover?q=${encodeURIComponent(query.trim())}`);
      }
    }
  }

  const bottom = anchor === "bottom";

  return createPortal(
    <div
      className={
        bottom
          ? // Clears the floating tab bar: its own bottom inset, the pill's
            // height, and a gap so the two read as separate things.
            // `px-4` matches the tab bar's own gutter exactly, so the panel and
            // the bar line up edge to edge rather than one overhanging the other.
            // Kept in step with `Nav`'s own inset, the search circle's height
            // and a gap: change one and this has to move with it.
            "fixed inset-0 z-[100] flex items-end justify-center bg-black/60 px-4 pb-[calc(max(0.5rem,calc(env(safe-area-inset-bottom)-0.75rem))+3rem+0.75rem)] backdrop-blur-sm"
          : "fixed inset-0 z-[100] flex items-start justify-center bg-black/70 p-4 pt-[12vh] backdrop-blur-sm"
      }
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        // Anchored low, this is literally the tab bar's material — the same
        // constant, so fill, border, blur and text colour cannot drift apart
        // from the bar sitting a few pixels below it. Only the radius differs,
        // capsule down there and a panel up here.
        //
        // Reversed in that case too, so the field stays put against the bar and
        // the matches grow upwards instead of pushing it around. And no `max-w`:
        // the bar it lines up with has none either, so capping this one would
        // leave the two different widths on a wide phone held sideways.
        //
        // The desktop dialog keeps `ios-menu`, the app's popover glass. It is a
        // far bigger surface with no bar to match, and the capsule's thin fill
        // is not enough to read a list through at that size.
        className={`w-full overflow-hidden ${
          bottom
            ? `${FLOATING_MATERIAL} flex flex-col-reverse rounded-3xl`
            : "ios-menu max-w-xl rounded-2xl border border-ink-700/70 bg-ink-850/95 shadow-2xl shadow-black/60 backdrop-blur-2xl backdrop-saturate-150"
        }`}
      >
        <div
          className={`flex items-center gap-3 px-4 ${
            bottom
              ? // Only once there is something above it to divide from: an
                // otherwise empty line above the field looks like a mistake.
                // The colour is the material's own border, not the menu's.
                rows.length > 0
                ? "border-t border-ink-600/80 light:border-ink-600"
                : ""
              : "border-b border-ink-700/60"
          }`}
        >
          {/* On the capsule material the glyphs are the same white as the tab
              bar's; in the desktop menu they stay the quieter grey. */}
          <Search size={18} className={`shrink-0 ${bottom ? "text-ink-100" : "text-ink-400"}`} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search films, shows, actors and people…"
            aria-label="Search films, shows, actors and people"
            className="w-full bg-transparent py-4 text-sm text-ink-100 outline-none placeholder:text-white/70 light:placeholder:text-ink-300"
          />
          {/* `ink-500` was never a colour — the ramp goes 400 then 300 — so this
              generated no class and the spinner came out at full brightness. */}
          {loading && <Loader2 size={16} className={`shrink-0 animate-spin ${SUBTLE}`} />}
          <button
            onClick={onClose}
            aria-label="Close search"
            className={`shrink-0 rounded-full p-1.5 transition hover:text-ink-100 ${
              bottom
                ? "text-ink-100 hover:bg-white/10 light:hover:bg-black/8"
                : "text-ink-400 hover:bg-ink-800"
            }`}
          >
            <X size={16} />
          </button>
        </div>

        {rows.length > 0 && (
          <ul
            className={`overflow-y-auto p-1.5 ${bottom ? "max-h-[45vh]" : "max-h-[52vh]"}`}
          >
            {rows.map((row, i) => (
              <li key={row.key}>
                {/* An inset rounded highlight rather than a full-bleed band —
                    the same shape language as the tab bar's active pill, and it
                    keeps the panel's own rounded corners intact. */}
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(row)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition ${
                    // The same wash as the tab bar's active pill.
                    i === active ? "bg-white/10 light:bg-black/8" : ""
                  }`}
                >
                  {row.kind === "library" ? (
                    <LibraryRow item={row.item} />
                  ) : row.kind === "person" ? (
                    <PersonRow person={row.person} />
                  ) : row.kind === "cast" ? (
                    <CastRow cast={row.cast} />
                  ) : (
                    <TitleRow title={row.title} />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* The hint row is for a keyboard, and the low anchor only ever appears
            on a phone — where it would just be a strip of text between the
            matches and the field. */}
        {!bottom && (
          <div
            className={`flex items-center justify-between border-t border-ink-700/60 px-4 py-2.5 text-[11px] ${SUBTLE}`}
          >
            <span>
              {trimmed.length >= 2 && !loading && rows.length === 0
                ? "No matches"
                : "Type to search"}
            </span>
            <span className="hidden sm:block">↑↓ to move · ↵ to open · esc to close</span>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Something already yours.
 *
 * Marked by the accent rather than by a section header, on purpose: the row
 * list is deliberately flat so arrow keys can walk it without reconciling an
 * index against headings, so what a row *is* has to be legible from the row
 * itself. The caption does that — "Watched 3× · rated 82%" is both the label
 * and the useful part.
 */
function LibraryRow({ item }: { item: Library }) {
  const art = item.poster ? img.poster(item.poster, "w185") : null;

  return (
    <>
      <span className="relative grid h-12 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/10 text-white/50">
        {art ? (
          <Image src={art} alt="" fill sizes="36px" className="object-cover" />
        ) : item.listId ? (
          <Bookmark size={14} />
        ) : (
          <Clock size={14} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.title}</span>
        <span className={`block truncate text-xs ${SUBTLE}`}>{item.notes.join(" · ")}</span>
      </span>

      {/* Says "this one is from your own shelves" without a heading above it. */}
      <span className="shrink-0 rounded-full bg-flare-600/25 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-flare-200 uppercase light:text-flare-700">
        Yours
      </span>
    </>
  );
}

/**
 * An actor or crew member. A round portrait, like the instance's own people, so
 * "this is a person" reads before any of the words do — but with what they are
 * known for underneath, which is the only way to tell two actors of the same
 * name apart.
 */
function CastRow({ cast }: { cast: Cast }) {
  const portrait = img.profile(cast.profile);

  return (
    <>
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-ink-800 ${SUBTLE}`}
      >
        {portrait ? (
          <Image
            src={portrait}
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 object-cover"
          />
        ) : (
          <UserIcon size={16} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{cast.name}</span>
        <span className={`block truncate text-xs ${SUBTLE}`}>
          {cast.knownFor || cast.department || "Person"}
        </span>
      </span>
      <span className={`shrink-0 text-[10px] font-medium tracking-wider uppercase ${SUBTLE}`}>
        {cast.department === "Acting" ? "Actor" : (cast.department ?? "Person")}
      </span>
    </>
  );
}

function PersonRow({ person }: { person: Person }) {
  return (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-flare-600 to-ember-500 text-sm font-black text-white">
        {person.avatar ? (
          <Image
            src={person.avatar}
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 object-cover"
            unoptimized
          />
        ) : (
          person.name.slice(0, 1).toUpperCase()
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{person.name}</span>
        <span className={`flex items-center gap-1.5 text-xs ${SUBTLE}`}>
          <UserIcon size={11} />
          {person.isFriend ? "Friend" : "On this instance"}
        </span>
      </span>
    </>
  );
}

function TitleRow({ title }: { title: Title }) {
  const poster = title.poster ? `https://image.tmdb.org/t/p/w185${title.poster}` : null;
  const Icon = title.mediaType === "tv" ? Tv : Film;

  return (
    <>
      <span className="relative h-14 w-10 shrink-0 overflow-hidden rounded-md bg-ink-800">
        {poster && <Image src={poster} alt="" fill sizes="40px" className="object-cover" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title.title}</span>
        <span className={`flex items-center gap-1.5 text-xs ${SUBTLE}`}>
          <Icon size={11} />
          {title.mediaType === "tv" ? "Show" : "Movie"}
          {title.year ? ` · ${title.year}` : ""}
        </span>
      </span>
      {title.score > 0 && (
        <span className={`shrink-0 font-mono text-xs ${SUBTLE}`}>{title.score}%</span>
      )}
    </>
  );
}
