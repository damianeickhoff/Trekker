"use client";

import type { NewsRow } from "@/lib/news";
import type { TitleArt } from "@/lib/news-page";
import { kindLabel, markOnOpening, yourByline, yourHeadline } from "@/lib/news-words";
import { titleHref } from "@/lib/marks";
import { useBell } from "../bell/bell-provider";
import { Link } from "../link";
import { ZOOM, ZOOM_GROUP, ZOOM_SHADOW } from "../motion";
import { Poster } from "../poster";
import { RailBackdrop, RailImage } from "../rail";
import { PersonPhoto } from "../title/people";
import { StateChip } from "../ui";
import { NewsPicture, NoPicture } from "./no-picture";
import { Byline, SMALL_CARD } from "./press-cards";

/*
 * Your own news (For you) on the News page and Home (Round 10), in the shapes
 * the boards draw: the feed's small card, the desktop column's compact row,
 * the phone's 190px rail card, and Home's rail card. Each carries the amber
 * kind chip, since this is news about what you follow, and the title's poster
 * or the person's headshot. Opening one marks it read, as a bell row does,
 * through the bell's own mark so the sidebar's count and the bell drop
 * together, unless Settings › News says only Mark all read should
 * (`markOnOpen`).
 */

function useOpen(row: NewsRow, markOnOpen: boolean) {
  const { markOne } = useBell();
  return () => {
    const key = markOnOpening(row, markOnOpen);
    if (key) markOne(key);
  };
}

/** A person's headshot, round, or their initials on their own tint. */
function Face({ row, size, text }: { row: NewsRow; size: number; text: string }) {
  return (
    <span style={{ width: size, height: size }} className="block shrink-0 overflow-hidden rounded-full">
      <PersonPhoto
        id={row.subjectId}
        name={yourByline(row)}
        path={row.image}
        sizes={`${size}px`}
        text={text}
        className={`size-full object-[center_20%] ${ZOOM}`}
      />
    </span>
  );
}

const unreadWeight = (row: NewsRow) => (row.read ? "font-semibold" : "font-bold");

/**
 * The feed's small card for one of your rows: a 96×64 picture (the title's
 * backdrop from the cache, or its poster cropped) or the person's headshot in
 * a 56px circle, the amber kind chip, the byline, the headline in two lines.
 */
export function YourSmallCard({ row, art, age, markOnOpen }: { row: NewsRow; art?: TitleArt; age: string; markOnOpen: boolean }) {
  const open = useOpen(row, markOnOpen);
  const backdrop = art?.backdrop ?? null;
  return (
    <Link href={titleHref(row.mediaType, row.tmdbId)} onClick={open} className={`${ZOOM_GROUP} ${SMALL_CARD} text-ink`}>
      {row.subject === "person" ? (
        <Face row={row} size={56} text="text-xl" />
      ) : (
        <span className={`${ZOOM_SHADOW} block shrink-0 rounded-[10px]`}>
          <span className="relative block h-16 w-24 overflow-hidden rounded-[inherit] bg-surface-2">
            <NewsPicture backdrop={backdrop} poster={row.image} source={row.title} backdropWidth={300} sizes="96px" mark={20} />
          </span>
        </span>
      )}
      <span className="flex min-w-0 grow flex-col gap-1.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <StateChip small>{kindLabel(row)}</StateChip>
          <Byline>
            {yourByline(row)} · {age}
          </Byline>
          {!row.read && <span aria-label="Unread" className="ml-auto size-2 shrink-0 rounded-full bg-accent" />}
        </span>
        <span className={`line-clamp-2 text-sm leading-[1.3] ${unreadWeight(row)}`}>{yourHeadline(row)}</span>
      </span>
    </Link>
  );
}

/** The desktop column's For you row: a 40px poster or headshot, the chip and age, the headline in two lines. */
export function YourCompactRow({ row, age, markOnOpen }: { row: NewsRow; age: string; markOnOpen: boolean }) {
  const open = useOpen(row, markOnOpen);
  return (
    <Link
      href={titleHref(row.mediaType, row.tmdbId)}
      onClick={open}
      className={`${ZOOM_GROUP} flex items-center gap-3 border-b border-line py-2.5 text-ink last:border-b-0`}
    >
      {row.subject === "person" ? (
        <Face row={row} size={40} text="text-sm" />
      ) : (
        <span className="block shrink-0 overflow-hidden rounded-md">
          <Poster path={row.image} alt="" title={row.title} width={40} height={60} sizes="40px" className={`h-[60px] w-10 text-[6px] ${ZOOM}`} />
        </span>
      )}
      <span className="flex min-w-0 grow flex-col gap-[3px]">
        <span className="flex items-center gap-1.5">
          <StateChip small>{kindLabel(row)}</StateChip>
          <Byline>{age}</Byline>
        </span>
        <span className={`line-clamp-2 text-[13px] leading-[1.3] ${unreadWeight(row)}`}>{yourHeadline(row)}</span>
      </span>
    </Link>
  );
}

/** The phone's For you rail card, 190px: the poster or headshot small beside the chip, the headline in two lines, the age. */
export function YourRailCard({ row, age, markOnOpen }: { row: NewsRow; age: string; markOnOpen: boolean }) {
  const open = useOpen(row, markOnOpen);
  return (
    <Link
      href={titleHref(row.mediaType, row.tmdbId)}
      onClick={open}
      role="listitem"
      className="flex w-[190px] shrink-0 flex-col gap-2 rounded-[14px] bg-surface p-3 text-ink shadow-elevation"
    >
      <span className="flex items-center gap-2">
        {row.subject === "person" ? (
          <Face row={row} size={28} text="text-[10px]" />
        ) : (
          <RailImage path={row.image} alt="" title={row.title} width={28} height={42} sizes="28px" className="h-[42px] w-7 rounded text-[4px]" />
        )}
        <StateChip small>{kindLabel(row)}</StateChip>
      </span>
      <span className={`line-clamp-2 min-h-[34px] text-[13px] leading-[1.3] ${unreadWeight(row)}`}>{yourHeadline(row)}</span>
      <Byline>{age}</Byline>
    </Link>
  );
}

/**
 * Home's News card (Round 10): 268px on desktop, 220px on a phone's swipe
 * rail; the picture on top at 2:1 (the title's backdrop from the cache, else
 * its poster cropped) with the kind chip on it and, for a followed person's
 * news, their face on the picture's corner; the headline in a fixed two
 * lines, so the cards line up; "Lanterns · 2 h" in mono.
 */
export function HomeNewsCard({ row, art, age, markOnOpen }: { row: NewsRow; art?: TitleArt; age: string; markOnOpen: boolean }) {
  const open = useOpen(row, markOnOpen);
  const backdrop = art?.backdrop ?? null;
  const poster = row.subject === "person" ? (art?.poster ?? null) : row.image;
  return (
    <Link
      href={titleHref(row.mediaType, row.tmdbId)}
      onClick={open}
      role="listitem"
      aria-label={`${kindLabel(row)}: ${yourHeadline(row)}`}
      className={`${ZOOM_GROUP} ${ZOOM_SHADOW} flex w-[220px] shrink-0 flex-col rounded-[14px] bg-surface text-ink shadow-elevation lg:w-[268px]`}
    >
      <span className="relative block">
        <span className="relative block aspect-[2/1] overflow-hidden rounded-t-[14px] bg-surface-2">
          {backdrop ? (
            <RailBackdrop path={backdrop} className={`size-full ${ZOOM}`} />
          ) : poster ? (
            <RailImage path={poster} alt="" title={row.title} width={268} height={402} sizes="268px" className={`size-full object-[center_22%] ${ZOOM}`} />
          ) : (
            <NoPicture source={row.title} />
          )}
        </span>
        <span className="absolute left-2.5 top-2.5">
          <StateChip small>{kindLabel(row)}</StateChip>
        </span>
        {row.subject === "person" && (
          <span className="absolute -bottom-3.5 right-2.5 rounded-full ring-2 ring-surface">
            <Face row={row} size={32} text="text-xs" />
          </span>
        )}
      </span>
      <span className="flex flex-col gap-1.5 p-3">
        <span className={`line-clamp-2 min-h-[34px] text-[13px] leading-[1.3] ${unreadWeight(row)}`}>{yourHeadline(row)}</span>
        <Byline>
          {yourByline(row)} · {age}
        </Byline>
      </span>
    </Link>
  );
}
