import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { CATEGORIES, fetchCategory, isCategory } from "@/lib/catalogue";
import { currentSeason } from "@/lib/current-season";
import { getWatchStatuses } from "@/lib/stats";
import { tmdbConfigured } from "@/lib/tmdb";
import { CategoryNav } from "@/components/category-nav";
import { MediaCard } from "@/components/media-card";
import { EmptyState, SetupNotice } from "@/components/ui";

type Props = {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { category } = await params;
  return {
    title: isCategory(category) ? `${CATEGORIES[category].title} — Trekker` : "Trekker",
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { category } = await params;
  if (!isCategory(category)) notFound();

  if (!tmdbConfigured()) {
    return (
      <div className="rise">
        <SetupNotice />
      </div>
    );
  }

  const { page: pageParam } = await searchParams;
  const page = Math.min(500, Math.max(1, Number(pageParam) || 1));

  const meta = CATEGORIES[category];
  const [data, user, { season }] = await Promise.all([
    fetchCategory(category, page).catch(() => null),
    getCurrentUser(),
    currentSeason(),
  ]);
  const statuses = user ? await getWatchStatuses(user.id) : undefined;

  return (
    <div className="rise">
      <Link
        href="/discover"
        className="inline-flex items-center gap-1 text-sm text-ink-400 transition hover:text-ink-100"
      >
        <ChevronLeft size={15} /> Discover
      </Link>

      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{meta.title}</h1>
      <p className="mt-1 text-sm text-ink-400">{meta.blurb}</p>

      <CategoryNav active={category} season={season} />

      {!data || data.items.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Nothing here" body="TMDB returned no titles for this list." />
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {data.items.map((item) => (
              <MediaCard
                key={`${item.mediaType}-${item.id}`}
                item={item}
                status={statuses?.get(`${item.mediaType}-${item.id}`)}
              />
            ))}
          </div>

          <nav className="mt-10 flex items-center justify-center gap-3">
            <PageLink
              category={category}
              page={page - 1}
              disabled={page <= 1}
              label="Previous"
            />
            <span className="font-mono text-sm text-ink-400 tabular-nums">
              {page} / {data.totalPages}
            </span>
            <PageLink
              category={category}
              page={page + 1}
              disabled={page >= data.totalPages}
              label="Next"
            />
          </nav>
        </>
      )}
    </div>
  );
}

function PageLink({
  category,
  page,
  disabled,
  label,
}: {
  category: string;
  page: number;
  disabled: boolean;
  label: "Previous" | "Next";
}) {
  const Icon = label === "Previous" ? ChevronLeft : ChevronRight;

  if (disabled) {
    return (
      <span className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-xl border border-ink-800 px-4 py-2 text-sm text-ink-600">
        {label === "Previous" && <Icon size={15} />}
        {label}
        {label === "Next" && <Icon size={15} />}
      </span>
    );
  }

  return (
    <Link
      href={`/discover/${category}?page=${page}`}
      className="inline-flex items-center gap-1.5 rounded-xl border border-ink-700 px-4 py-2 text-sm text-ink-100 transition hover:border-flare-500 hover:bg-ink-800"
    >
      {label === "Previous" && <Icon size={15} />}
      {label}
      {label === "Next" && <Icon size={15} />}
    </Link>
  );
}
