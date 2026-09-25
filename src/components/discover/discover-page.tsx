import { cache, Suspense, type ReactNode } from "react";
import { db } from "@/lib/db";
import {
  discoverPlan,
  fetchForYou,
  genreArtwork,
  seenAmong,
  tryCategory,
  withType,
  CATEGORIES,
  type CategorySlug,
  type DiscoverType,
} from "@/lib/discover";
import { FILTER_PATH } from "@/lib/discover-filters";
import { marksFor } from "@/lib/home";
import { titleKey, titleHref, type Mark } from "@/lib/marks";
import { regionFor } from "@/lib/providers";
import { splitTop } from "@/lib/spotlight";
import { requireUser } from "@/lib/title";
import type { ListItem } from "@/lib/tmdb";
import { GENRE_NAMES } from "@/lib/what-to-watch-quiz";
import { Icon, type IconName } from "../icon";
import { Link } from "../link";
import { MobileTop, PageBody, PhoneAccount } from "../page";
import { kindYear, PosterCard, WideCard } from "../poster-card";
import { Rail } from "../rail";
import { SectionHead } from "../section-head";
import { HeroArt } from "../title/hero";
import { buttonClass, iconButtonClass, PageTitle } from "../ui";
import { BillboardBones, EyebrowBones, GenreBones, PosterRailBones } from "./bones";
import { BAND, BandArt, CategoryChips, EmptyNote, TypeChips } from "./parts";
import { TopCarousel, type SpotlightItem } from "./top-carousel";
import { GenreTile, RankedTile, SpotlightCard } from "./tiles";

/*
 * Discover, in tiers. Trending is awaited: it is what the screen is for, and
 * the top five (a carousel of three and two beside it) and the rest of the
 * top 20 are drawn from it.
 * The genre tiles and the billboard row stream in behind it, then each of the
 * four rails in a boundary of its own, then the two groups at the foot. Every
 * rail is one cached TMDB answer, or for "Things you may like" five; everything
 * personal is rows.
 */

type Context = { type: DiscoverType; region: string; today: string };

/** Once per request, however many tiers ask. */
const contextFor = cache(async (userId: string, type: DiscoverType): Promise<Context> => {
  const me = await db.user.findUnique({ where: { id: userId }, select: { region: true } });
  return { type, region: regionFor(me?.region), today: new Date().toISOString().slice(0, 10) };
});

/** Marks and ticks for a rail's worth of titles: two batched reads, never one per poster. */
async function decorate(userId: string, items: ListItem[]) {
  const [marks, seen] = await Promise.all([
    marksFor(items.map((i) => ({ mediaType: i.mediaType, tmdbId: i.id }))),
    seenAmong(userId, items),
  ]);
  return {
    mark: (i: ListItem): Mark => marks[titleKey(i.mediaType, i.id)] ?? null,
    seen: (i: ListItem) => seen.has(titleKey(i.mediaType, i.id)),
  };
}

const PICK_FOR_ME = "/discover/what-to-watch";

/** Pick for me's sparkle, the one amber on the button: it turns 20° when the button is hovered. */
const SPARKLE = "text-accent-text transition-[rotate] duration-(--base) ease-out motion-safe:group-hover/pick:rotate-[20deg]";

/** "Drama, Crime": the first two genres, for a line under a title. */
function genreWords(item: ListItem) {
  return item.genreIds
    .map((id) => GENRE_NAMES[id])
    .filter(Boolean)
    .slice(0, 2)
    .map((g) => g.charAt(0).toUpperCase() + g.slice(1))
    .join(", ");
}

export async function DiscoverScreen({ type }: { type: DiscoverType }) {
  const user = await requireUser();
  const ctx = await contextFor(user.id, type);
  const trending = await tryCategory("trending", ctx);
  const items = trending?.items ?? [];
  const look = await decorate(user.id, items);
  const desk = splitTop(items, "desktop");
  const { carousel, stacked } = desk;
  // The phone starts the rest at #4; on desktop #4 and #5 stand beside the carousel, so their tiles hide from `lg`.
  const rest = splitTop(items, "phone").rest;
  const deskFrom = desk.rest[0]?.rank ?? 21;
  const slide = (item: ListItem, meta: string): SpotlightItem => ({
    key: titleKey(item.mediaType, item.id),
    href: titleHref(item.mediaType, item.id),
    title: item.title,
    backdrop: item.backdrop,
    poster: item.poster,
    score: item.score,
    meta,
    overview: item.overview,
    mark: look.mark(item),
  });

  return (
    <>
      {carousel.length ? (
        // Dark in both themes: the #1's artwork, blurred, behind the carousel.
        <div className="relative flex flex-col pb-6 lg:hidden">
          <HeroArt path={carousel[0].backdrop} />
          <MobileTop title="Discover" onHero right={<TopButtons onHero />} />
          <div className="relative z-(--z-lift) px-5 pt-2">
            <TopCarousel size="phone" items={carousel.map((item) => slide(item, [kindYear(item), genreWords(item) || null].filter(Boolean).join(" · ")))} />
          </div>
        </div>
      ) : (
        <MobileTop title="Discover" right={<TopButtons onHero={false} />} />
      )}
      <PageBody className="pt-1.5! lg:pt-7!">
        {/* Desktop: the title on a line of its own, then the kind chips left
            and the two buttons right, so the title never shares a baseline
            with controls of a different height. */}
        <div className="hidden flex-col gap-4 lg:flex">
          <PageTitle>Discover</PageTitle>
          <div className="flex items-center gap-4">
            <TypeChips base="/discover" current={type} />
            <span className="grow" />
            <Link href={PICK_FOR_ME} className={buttonClass("ghost", "sm", "group/pick")}>
              <Icon name="sparkle" size={18} className={SPARKLE} />
              Pick for me
            </Link>
            <Link href={FILTER_PATH} className={buttonClass("ghost", "sm")}>
              <Icon name="sliders" size={18} />
              Filters
            </Link>
          </div>
        </div>
        {/* Phones: the header keeps search and the avatar; these two get their
            words back here, half the row each, over the type chips. */}
        <div className="flex gap-2 lg:hidden">
          <Link href={PICK_FOR_ME} className={buttonClass("ghost", "sm", "group/pick flex-1")}>
            <Icon name="sparkle" size={18} className={SPARKLE} />
            Pick for me
          </Link>
          <Link href={FILTER_PATH} className={buttonClass("ghost", "sm", "flex-1")}>
            <Icon name="sliders" size={18} />
            Filters
          </Link>
        </div>
        <TypeChips base="/discover" current={type} className="lg:hidden" />
        <CategoryChips type={type} />

        {items.length === 0 ? (
          <EmptyNote title="Trending could not be loaded">
            TMDB did not answer and nothing is stored here for this hour yet. Try again in a minute.
          </EmptyNote>
        ) : (
          <>
            {/*
              Desktop, the top five in 480px (Round 9): #1 to #3 turning in one
              big card on the left, #4 and #5 stacked on the right, 236px each
              with the 8px between, the right column about three fifths of the
              left's width. The phone has the same carousel on the hero above,
              and no #4 and #5 beside it.
            */}
            <div className="hidden h-[480px] grid-cols-[1.7fr_1fr] gap-3 lg:grid">
              <TopCarousel size="desk" items={carousel.map((item) => slide(item, kindYear(item)))} />
              {stacked.length > 0 && (
                <div role="list" aria-label="Fourth and fifth this week" className="grid min-w-0 grid-rows-2 gap-2">
                  {stacked.map(({ item, rank }) => (
                    <SpotlightCard key={titleKey(item.mediaType, item.id)} item={item} rank={rank} mark={look.mark(item)} />
                  ))}
                </div>
              )}
            </div>

            {/* From #4 on phones and #6 on desktop, after the carousel (and #4 and #5): one row, full width. */}
            {rest.length > 0 && (
              <section aria-labelledby="trending" className="flex min-w-0 flex-col gap-2.5 lg:gap-3">
                <SectionHead id="trending" title="The rest of the top 20" meta="this week" href={withType("/discover/trending", type)} />
                <Rail label="The rest of the top 20" cards>
                  {rest.map(({ item, rank }) => (
                    <RankedTile
                      key={titleKey(item.mediaType, item.id)}
                      item={item}
                      rank={rank}
                      mark={look.mark(item)}
                      seen={look.seen(item)}
                      className={rank < deskFrom ? "lg:hidden" : ""}
                    />
                  ))}
                </Rail>
              </section>
            )}

            <Suspense fallback={<GenreBones />}>
              <GenresTier type={type} />
            </Suspense>

            <Suspense fallback={<BillboardBones />}>
              <BillboardTier type={type} />
            </Suspense>
            <Suspense fallback={<PosterRailBones />}>
              <ForYouTier type={type} />
            </Suspense>
            {discoverPlan(type).rails.map((slug) => (
              <Suspense key={slug} fallback={<PosterRailBones />}>
                <CategoryTier type={type} slug={slug} />
              </Suspense>
            ))}
            <Suspense fallback={<EyebrowBones />}>
              <GroupsTier type={type} />
            </Suspense>
          </>
        )}
      </PageBody>
    </>
  );
}

/** A round button in the phone's top row: glass on the hero, a plain surface off it. */
function TopIcon({ href, icon, label, onHero }: { href: string; icon: IconName; label: string; onHero: boolean }) {
  return (
    <Link href={href} aria-label={label} className={iconButtonClass(onHero ? "glass" : "ghost", "sm")}>
      <Icon name={icon} size={20} />
    </Link>
  );
}

/** Search, the bell and the avatar. Pick for me and Filters are text buttons under the carousel. */
function TopButtons({ onHero }: { onHero: boolean }) {
  return (
    <>
      <TopIcon href="/search" icon="search" label="Search" onHero={onHero} />
      <PhoneAccount onHero={onHero} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Tier 2

async function GenresTier({ type }: { type: DiscoverType }) {
  const user = await requireUser();
  const ctx = await contextFor(user.id, type);
  // Trending is this hour's cache row by now, so this is a database read.
  const trending = await tryCategory("trending", ctx);
  const tiles = await genreArtwork(type, ctx.today, trending?.items ?? []);
  return (
    <section aria-labelledby="genres" className="flex min-w-0 flex-col gap-2.5 lg:gap-3">
      <SectionHead id="genres" title="Find your next watch" meta="genres" />
      {/* One scrolling row at every width, every genre the view offers. */}
      <Rail label="Genres" cards>
        {tiles.map((g) => (
          <GenreTile key={g.slug} {...g} type={type} />
        ))}
      </Rail>
    </section>
  );
}

async function BillboardTier({ type }: { type: DiscoverType }) {
  const user = await requireUser();
  const ctx = await contextFor(user.id, type);
  const slug = discoverPlan(type).billboard;
  const page = await tryCategory(slug, ctx);
  const items = page?.items ?? [];
  if (items.length === 0) return null;
  const look = await decorate(user.id, items);
  return (
    <section aria-labelledby="billboard" className="flex min-w-0 flex-col gap-2.5 lg:gap-3">
      <SectionHead
        id="billboard"
        title={CATEGORIES[slug].title}
        meta={slug === "in-cinemas" ? "near you" : "this week"}
        href={withType(`/discover/${slug}`, type)}
      />
      <Rail label={CATEGORIES[slug].title} cards>
        {items.slice(0, 12).map((item) => (
          <WideCard
            key={item.id}
            href={titleHref(item.mediaType, item.id)}
            label={item.title}
            backdrop={item.backdrop}
            poster={item.poster}
            title={item.title}
            mark={look.mark(item)}
            score={item.score}
            foot={<span className="text-[11px] text-white/78">{kindYear(item)}</span>}
          />
        ))}
      </Rail>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tier 3: the four rails, each streamed on its own

/** The standard poster cards for a rail's worth of list items. */
function PosterCards({
  label,
  items,
  look,
  onDark = false,
}: {
  label: string;
  items: ListItem[];
  look: Awaited<ReturnType<typeof decorate>>;
  /** On a band, which is dark in both themes, so the captions are white. */
  onDark?: boolean;
}) {
  return (
    <Rail label={label} cards className={onDark ? "text-white [&_.text-ink-3]:text-white/78" : ""}>
      {items.map((item) => (
        <PosterCard
          key={titleKey(item.mediaType, item.id)}
          item={{ ...item, tmdbId: item.id }}
          mark={look.mark(item)}
          seen={look.seen(item)}
        />
      ))}
    </Rail>
  );
}

/** A rail of posters with its head. Nothing to show, nothing drawn. */
async function PosterRail({ userId, title, href, meta, items }: { userId: string; title: string; href: string; meta?: string; items: ListItem[] }) {
  if (items.length === 0) return null;
  const look = await decorate(userId, items);
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-2.5 lg:gap-3">
      <SectionHead title={title} meta={meta} href={href} />
      <PosterCards label={title} items={items} look={look} />
    </section>
  );
}

/** "Things you may like": from the last five titles watched, so someone who has watched nothing yet has no row. */
async function ForYouTier({ type }: { type: DiscoverType }) {
  const user = await requireUser();
  const items = (await fetchForYou(user.id, type)) ?? [];
  return (
    <PosterRail
      userId={user.id}
      title="Things you may like"
      meta="from what you watched"
      href={withType("/discover/for-you", type)}
      items={items.slice(0, 20)}
    />
  );
}

async function CategoryTier({ type, slug }: { type: DiscoverType; slug: CategorySlug }) {
  const user = await requireUser();
  const ctx = await contextFor(user.id, type);
  const page = await tryCategory(slug, ctx);
  return <PosterRail userId={user.id} title={CATEGORIES[slug].title} href={withType(`/discover/${slug}`, type)} items={page?.items ?? []} />;
}

// ---------------------------------------------------------------------------
// Tier 4

/**
 * On the horizon and the hall of fame: two rails each, on a dark band under a
 * mono eyebrow. The band is lit by the first of its titles that has a
 * backdrop, which the cached list rows already carry, so it costs one image
 * and no request of its own; with none, it is plain night.
 */
async function GroupsTier({ type }: { type: DiscoverType }) {
  const user = await requireUser();
  const ctx = await contextFor(user.id, type);
  const plan = discoverPlan(type);
  const slugs = [...plan.horizon, ...plan.hallOfFame];
  const pages = await Promise.all(slugs.map((s) => tryCategory(s, ctx)));
  const bySlug = new Map(slugs.map((s, i) => [s, pages[i]?.items ?? []]));
  const look = await decorate(user.id, pages.flatMap((p) => p?.items ?? []));

  const rail = (slug: CategorySlug) => {
    const items = bySlug.get(slug) ?? [];
    if (items.length === 0) return null;
    const title = CATEGORIES[slug].title;
    return (
      <section key={slug} aria-label={title} className="flex min-w-0 flex-col gap-2.5 lg:gap-3">
        <SectionHead title={title} href={withType(`/discover/${slug}`, type)} onDark />
        <PosterCards label={title} items={items} look={look} onDark />
      </section>
    );
  };

  /** The first title across a group's rails, in the order they are drawn, that has a backdrop. */
  const backdropOf = (group: CategorySlug[]) =>
    group.flatMap((slug) => bySlug.get(slug) ?? []).find((item) => item.backdrop)?.backdrop ?? null;

  const horizon = plan.horizon.map(rail).filter(Boolean);
  const fame = plan.hallOfFame.map(rail).filter(Boolean);
  return (
    <>
      {horizon.length > 0 && (
        <Group id="horizon" eyebrow="On the horizon" blurb="Not out yet. Worth knowing about." backdrop={backdropOf(plan.horizon)}>
          {horizon}
        </Group>
      )}
      {fame.length > 0 && (
        <Group
          id="hall-of-fame"
          eyebrow="The hall of fame"
          blurb="The highest rated of all time, by everyone who bothered to vote."
          backdrop={backdropOf(plan.hallOfFame)}
        >
          {fame}
        </Group>
      )}
    </>
  );
}

/**
 * Two rails under one mono eyebrow and a line saying what they have in common,
 * on a band that is dark in both themes, so everything on it is white. The
 * band itself runs to the screen's edges on phones and past the content cap on
 * desktop; what stands on it stays in the page's own column, so its rails line
 * up with the ones above. The padding keeps the eyebrow and the posters clear
 * of the fades at either end (`bandScrim`).
 */
function Group({
  id,
  eyebrow,
  blurb,
  backdrop,
  children,
}: {
  id: string;
  eyebrow: string;
  blurb: string;
  backdrop: string | null;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={`${BAND} text-white`}>
      <BandArt path={backdrop} />
      <div className="flex flex-col gap-1">
        <h2 id={id} className="m-0 font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-white/78">
          {eyebrow}
        </h2>
        <p className="m-0 text-[13px] text-white/78">{blurb}</p>
      </div>
      {children}
    </section>
  );
}
