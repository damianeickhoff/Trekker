import Image from "next/image";
import Link from "next/link";
import { ListChecks, Sparkles } from "lucide-react";
import { img } from "@/lib/images";
import type { ListCardView } from "@/lib/lists";
import { LIST_ICONS, LIST_TINTS } from "./list-rail";
import { ListMenu } from "./list-menu";
import { Rail } from "./rail";

/**
 * A list as a tile: a mosaic of what is on it, its name, and how much.
 *
 * The artwork is doing the identifying here rather than the words — you know
 * your own lists by what is in them long before you have read the label — so
 * the posters get the whole top of the tile and the name sits under it like a
 * caption. Cropped rather than letterboxed, because four whole 2:3 posters
 * inside one frame end up postage-stamp sized and legible as nothing.
 *
 * A list with fewer than four titles simply spreads what it has across the
 * frame: one poster fills it, two split it, three leave the fourth cell as
 * plain tile. No placeholder art — an empty list looking empty is correct.
 */
export function ListCard({ list }: { list: ListCardView }) {
  const Icon = list.kind === "smart" ? Sparkles : ListChecks;
  const posters = list.posters.slice(0, 4);

  return (
    <div className="rail-item group/card relative w-[172px] sm:w-[204px]">
      <Link href={`/watchlist/list/${list.id}`} className="block" title={list.name}>
        <div
          className={`relative grid aspect-4/3 overflow-hidden rounded-xl border border-ink-700/60 bg-ink-800 ${
            posters.length > 1 ? "grid-cols-2" : "grid-cols-1"
          } ${posters.length > 2 ? "grid-rows-2" : "grid-rows-1"}`}
        >
          {posters.map((poster, index) => (
            <div key={`${poster}-${index}`} className="relative overflow-hidden bg-ink-850">
              <Image
                src={img.poster(poster)!}
                alt=""
                fill
                sizes="120px"
                className="object-cover md:transition md:duration-500 md:group-hover/card:scale-105"
              />
            </div>
          ))}

          {posters.length === 0 && (
            <div className="grid place-items-center text-ink-600">
              <Icon size={26} />
            </div>
          )}

          {/* No wash over the artwork: the corner mark carries its own blurred
              plate — the same one every overlay on a poster in this app uses —
              so darkening the whole mosaic to support it was dimming four
              posters to solve a problem at one corner of them. */}
          <span
            className={`absolute top-2 left-2 grid h-6 w-6 place-items-center rounded-full border border-white/20 bg-white/10 backdrop-blur-xs ${
              list.kind === "smart" ? "text-fresh-500" : "text-white"
            }`}
            title={list.kind === "smart" ? "Smart list" : "List"}
          >
            <Icon size={12} />
          </span>
        </div>

        <p className="mt-2 line-clamp-1 text-sm font-medium text-ink-100">{list.name}</p>
        <p className="line-clamp-1 text-xs text-ink-400">{list.description}</p>
      </Link>

      {/* Outside the link, or the menu's own clicks would navigate.
          Revealed on hover on a desktop and always present on touch, where
          there is no hover to reveal it with. `pointer-events` goes with the
          opacity: a control faded to nothing that still swallows clicks is a
          dead zone over the corner of the artwork. Keyboard focus is unaffected
          by it, so tabbing to the menu still reveals it. */}
      <div className="absolute top-1 right-1 md:pointer-events-none md:opacity-0 md:transition md:group-hover/card:pointer-events-auto md:group-hover/card:opacity-100 md:focus-within:pointer-events-auto md:focus-within:opacity-100">
        <ListMenu listId={list.id} name={list.name} kind={list.kind} />
      </div>
    </div>
  );
}

/**
 * One row for a whole section of lists — every manual list, or every smart one.
 *
 * A rail rather than a rail per list: there is no ceiling on how many somebody
 * makes, and a page that grows a new full-width row each time stops being an
 * overview very quickly.
 *
 * It owns its empty state rather than leaving the page to draw a heading of its
 * own beside it. Two components rendering the same heading is how the icon ends
 * up on one of them and not the other.
 */
export function ListCardRail({
  kind,
  title,
  description,
  lists,
  action,
  empty,
}: {
  kind: "manual" | "smart";
  title: string;
  description: string;
  lists: ListCardView[];
  /** The "make another one" control for this section. */
  action?: React.ReactNode;
  /** Shown in place of the rail when there is nothing in this section yet. */
  empty?: React.ReactNode;
}) {
  const Icon = LIST_ICONS[kind];

  return (
    <section className="mt-8">
      {/* The heading wraps, the button does not. `min-w-0` on the text is what
          lets it: without it a flex child refuses to shrink below its content
          and pushes the button into wrapping its own label instead. */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Icon size={17} className={`shrink-0 ${LIST_TINTS[kind]}`} />
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-ink-400">{description}</p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      {lists.length === 0 ? (
        empty
      ) : (
        <Rail>
          {lists.map((list) => (
            <ListCard key={list.id} list={list} />
          ))}
        </Rail>
      )}
    </section>
  );
}
