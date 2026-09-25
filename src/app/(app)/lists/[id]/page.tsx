import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Icon } from "@/components/icon";
import { Link } from "@/components/link";
import { PRESS } from "@/components/motion";
import { BannerArt } from "@/components/lists/banner-art";
import { BuildWatcher } from "@/components/lists/build-watcher";
import { DesktopControls, MobileHeaderControls, MobileHeroControls } from "@/components/lists/list-controls";
import { SortChips } from "@/components/lists/sort-chips";
import { EmptyBlock, Mosaic } from "@/components/lists/tiles";
import { TitleGrid } from "@/components/lists/title-grid";
import { heroScrim } from "@/components/title/hero";
import { getCurrentUser } from "@/lib/auth";
import { listDate, todayKey } from "@/lib/dates";
import { LIST_SORTS, parseListSort } from "@/lib/list-sorts";
import { listDetail, plural, requestPlan } from "@/lib/lists";
import { hoursAndMinutes } from "@/lib/progress";
import { instanceAdmin } from "@/lib/title";

export const metadata: Metadata = { title: "List" };

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ sort?: string }> };

/** "updated today", "updated Tuesday", "updated Tue 3 Sep": when a list last changed. */
function updatedWhen(at: Date, today: string) {
  const day = todayKey(at);
  if (day === today) return "today";
  const days = Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${day}T12:00:00`).getTime()) / 86_400_000);
  if (days === 1) return "yesterday";
  if (days < 7) return new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(at);
  return listDate(day);
}

/**
 * One list: the mosaic banner, its name and what it holds, Pick one for me,
 * the sort chips and the posters. Rows only, a smart list included: its rows
 * are the daily job's last answer, and nothing here asks TMDB again. A manual
 * list's posters carry the cross; a smart list's carry none, because a title
 * removed by hand would be back at the next rebuild.
 */
export default async function ListPage({ params, searchParams }: Params) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [{ id }, { sort: asked }] = await Promise.all([params, searchParams]);
  const sort = parseListSort(asked);
  const list = await listDetail(user.id, id, sort);
  if (!list) notFound();

  const smart = list.kind === "smart";
  const admin = await instanceAdmin();
  const canRequest = smart && Boolean(admin?.seerrUrl && admin?.seerrApiKey);
  const plan = canRequest ? await requestPlan(user.id, list.id) : null;

  const building = smart && list.refreshedAt === null;
  const today = todayKey();
  const sub = [
    plural(list.items.length, "title"),
    list.minutes ? hoursAndMinutes(list.minutes) : null,
    `${list.watchedCount} watched`,
  ]
    .filter(Boolean)
    .join(" · ");
  const origin = smart
    ? list.refreshedAt
      ? `rebuilt daily · updated ${updatedWhen(list.refreshedAt, today)}`
      : "rebuilt daily"
    : `made by you · updated ${updatedWhen(list.updatedAt, today)}`;

  const unseen = list.items.filter((i) => !i.watched);
  const pool = (unseen.length ? unseen : list.items).map((i) => ({ mediaType: i.mediaType, tmdbId: i.tmdbId }));
  const controls = { list: { id: list.id, name: list.name, kind: list.kind }, pool, plan };
  const art = list.mosaic.filter((m) => m.poster).slice(0, 4);

  return (
    <div className="relative">
      {/* The banner: the first four posters side by side, blurred, under the heroes' scrim. Dark in both themes. */}
      <div aria-hidden="true" className="hero-foot pointer-events-none absolute inset-x-0 top-0 h-[310px] overflow-hidden bg-night lg:bleed lg:h-[380px]">
        {/* Settles from 1.04 to 1 once its posters have loaded, as a title's backdrop does. */}
        <BannerArt posters={art.map((m) => m.poster!)} />
        <span className="absolute inset-0" style={{ background: heroScrim() }} />
      </div>

      <div className="relative flex flex-col">
        {/* Phones: the way back and the list's buttons on the banner. */}
        <header className="flex h-[66px] items-center justify-between px-5 pt-[22px] lg:hidden">
          <Link href="/lists" aria-label="Back to Lists" className={`${PRESS} inline-flex size-10 items-center justify-center rounded-full bg-white/16 text-white backdrop-blur-[10px] hover:bg-white/26`}>
            <Icon name="chevL" size={20} />
          </Link>
          <MobileHeaderControls {...controls} />
        </header>
        <div className="flex min-h-[190px] flex-col justify-end gap-2 px-5 pb-4 text-white lg:hidden">
          <h1 className="m-0 font-display text-[32px] font-extrabold leading-[0.98] tracking-[-0.035em] wrap-anywhere">{list.name}</h1>
          <span className="text-[13px] text-white/78">
            {sub} · {smart ? "rebuilt daily" : "made by you"}
          </span>
          <MobileHeroControls {...controls} />
        </div>

        {/* Desktop: back, then the mosaic beside the name and the buttons. */}
        <div className="hidden flex-col gap-[26px] px-10 pt-9 lg:flex">
          <Link href="/lists" className="inline-flex items-center gap-1.5 self-start text-[13px] font-semibold text-white/80 hover:text-white">
            <Icon name="chevL" size={16} />
            Lists
          </Link>
          <div className="flex items-end gap-6 text-white">
            <Mosaic
              cells={list.mosaic}
              cellClass="h-[78px]"
              sizes="80px"
              className="w-40 shrink-0 shadow-[0_20px_50px_rgba(0,0,0,0.45)]"
            />
            <div className="flex min-w-0 grow flex-col gap-2">
              <span className="font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-white/60">
                {smart ? "Smart list" : "Your list"}
              </span>
              <h1 className="m-0 font-display text-5xl font-extrabold leading-[0.95] tracking-[-0.035em] wrap-anywhere">{list.name}</h1>
              <span className="text-sm text-white/78">
                {sub} · {origin}
              </span>
            </div>
            <DesktopControls {...controls} />
          </div>
        </div>

        <div className="flex flex-col gap-3.5 px-5 pt-3 lg:gap-4 lg:px-10 lg:pt-5">
          {list.items.length > 0 && (
            <div className="flex items-center gap-3">
              <SortChips base={`/lists/${list.id}`} sorts={LIST_SORTS} current={sort} className="grow" />
              <span className="mono-label hidden shrink-0 lg:inline">{plural(list.items.length, "title")}</span>
            </div>
          )}

          {building && (
            <p className="m-0 text-[13px] text-ink-2">
              Being built from its filters. The titles arrive in a moment.
              <BuildWatcher />
            </p>
          )}

          {list.items.length > 0 ? (
            <TitleGrid
              items={list.items}
              label={list.name}
              remove={smart ? undefined : { mode: "always", target: { kind: "list", listId: list.id } }}
            />
          ) : smart ? (
            !building && (
              <EmptyBlock icon="sparkle" title="Nothing matches today">
                No title answers this list&rsquo;s filters at the moment. Loosen them, or wait for tomorrow&rsquo;s rebuild.
              </EmptyBlock>
            )
          ) : (
            <EmptyBlock icon="list" title="Nothing on it yet">
              Add titles with the plus at the top, or press Save on any title page and tick this list.
            </EmptyBlock>
          )}
        </div>
      </div>
    </div>
  );
}
