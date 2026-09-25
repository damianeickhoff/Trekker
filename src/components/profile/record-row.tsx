import type { RecordRow } from "@/lib/profile";
import { episodeCode, titleHref } from "@/lib/marks";
import { whenLabel } from "@/lib/when";
import { Link } from "../link";
import { Poster } from "../poster";

/*
 * One viewing as a row, on its own so the client-side list that appends
 * rows (record-list.tsx) can import it without dragging profile/parts.tsx,
 * whose value imports reach lib/profile and the server behind it.
 */

const clock = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** "S03 · E07 · Radio", or "Film · 1 h 48". */
export function recordLine(row: RecordRow) {
  if (row.mediaType === "tv") return [episodeCode(row.seasonNumber, row.episodeNumber), row.episodeName].filter(Boolean).join(" · ");
  if (!row.runtime) return "Film";
  const h = Math.floor(row.runtime / 60);
  const m = row.runtime % 60;
  return `Film · ${h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`}`;
}

/**
 * One viewing as a row on the surface. `day` adds the day to the time for
 * the profile's week ("Yesterday · 21:40"); the history's rows sit under a
 * day heading and give the time alone.
 */
export function RecordRowCard({ row, day = true }: { row: RecordRow; day?: boolean }) {
  const at = new Date(row.at);
  return (
    <Link
      href={titleHref(row.mediaType, row.tmdbId)}
      className="flex min-w-0 items-center gap-3 rounded-xl bg-surface py-2 pl-2 pr-2.5 shadow-elevation transition-colors duration-(--fast) ease-out hover:bg-surface-2"
    >
      <Poster path={row.poster} alt="" title={row.title} width={36} height={54} sizes="36px" className="h-[54px] w-9 rounded-md" />
      <span className="flex min-w-0 grow flex-col gap-0.5">
        <span className="truncate text-sm font-semibold">{row.title}</span>
        <span className="truncate text-xs text-ink-2">{recordLine(row)}</span>
      </span>
      <span className="shrink-0 whitespace-nowrap font-mono text-[10px] font-medium uppercase tracking-[0.05em] text-ink-3">
        {day ? `${whenLabel(row.at, new Date(), { today: "word" })} · ${clock(at)}` : clock(at)}
      </span>
    </Link>
  );
}
