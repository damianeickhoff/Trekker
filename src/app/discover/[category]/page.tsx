import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { CATEGORIES, fetchCategory, isCategory } from "@/lib/catalogue";
import { currentSeason } from "@/lib/current-season";
import { tmdbConfigured } from "@/lib/tmdb";
import { CategoryNav } from "@/components/category-nav";
import { Pager } from "@/components/pager";
import { PosterGrid } from "@/components/poster-grid";
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
  const [data, { season }] = await Promise.all([
    fetchCategory(category, page).catch(() => null),
    currentSeason(),
  ]);

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
          <PosterGrid items={data.items} />

          <Pager
            page={page}
            totalPages={data.totalPages}
            basePath={`/discover/${category}`}
          />
        </>
      )}
    </div>
  );
}
