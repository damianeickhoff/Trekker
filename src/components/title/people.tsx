import Image from "next/image";
import { tmdbSrc } from "@/lib/tmdb-image-loader";
import { Link } from "../link";
import { ZOOM, ZOOM_GROUP, ZOOM_SHADOW } from "../motion";

/*
 * People are square-ish tiles at 4:5, everywhere: TMDB's profile photo at
 * w185, or the initials on a colour of their own when there is none.
 */

/** Tints read off the mockups' posters: dark enough for white initials in both themes. */
const TINTS = ["#B3121A", "#D62A7A", "#3D5A45", "#2A3340", "#C9661B", "#4C7FA8", "#2A6EA6", "#1F6B78", "#5A6270", "#D9491F"];

export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function PersonPhoto({
  id,
  name,
  path,
  className = "",
  sizes = "185px",
  text = "text-[28px]",
}: {
  id: number;
  name: string;
  path: string | null;
  className?: string;
  sizes?: string;
  text?: string;
}) {
  if (path) {
    return (
      <Image
        src={tmdbSrc(path)}
        alt=""
        width={185}
        height={231}
        sizes={sizes}
        className={`block aspect-[4/5] shrink-0 object-cover ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ background: TINTS[id % TINTS.length] }}
      className={`inline-flex aspect-[4/5] shrink-0 items-center justify-center font-display font-extrabold tracking-[-0.03em] text-white ${text} ${className}`}
    >
      {initialsOf(name)}
    </span>
  );
}

export type PersonCard = { id: number; name: string; role: string; profile: string | null; extra?: string | null };

/** A person with their part under them, linking to their page. */
export function PersonTile({ person, className = "", sizes }: { person: PersonCard; className?: string; sizes?: string }) {
  return (
    <Link href={`/person/${person.id}`} role="listitem" className={`${ZOOM_GROUP} flex min-w-0 shrink-0 flex-col gap-2 ${className}`}>
      {/* The photo zooms in its frame on a hover; the name under it stays. */}
      <span className={`block rounded-[14px] ${ZOOM_SHADOW}`}>
        <span className="block overflow-hidden rounded-[14px] shadow-elevation">
          <PersonPhoto id={person.id} name={person.name} path={person.profile} sizes={sizes} className={`w-full ${ZOOM}`} />
        </span>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="line-clamp-2 text-[13px] font-semibold leading-[1.2]">{person.name}</span>
        {person.role && <span className="line-clamp-2 text-xs text-ink-2">{person.role}</span>}
        {person.extra && <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-ink-3">{person.extra}</span>}
      </span>
    </Link>
  );
}
