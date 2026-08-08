import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { fetchGenre, findGenre, type GenreFilter } from "@/lib/catalogue";
import { tmdbConfigured } from "@/lib/tmdb";
import { Pager } from "@/components/pager";
import { PosterGrid } from "@/components/poster-grid";
import { EmptyState, SetupNotice } from "@/components/ui";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string; type?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const genre = findGenre(slug);
  return { title: genre ? `${genre.label} — Trekker` : "Trekker" };
}

const FILTERS: { value: GenreFilter; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "movie", label: "Movies" },
  { value: "tv", label: "Shows" },
];

export default async function GenrePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const genre = findGenre(slug);
  if (!genre) notFound();

  if (!tmdbConfigured()) {
    return (
      <div className="rise">
        <SetupNotice />
      </div>
    );
  }

  const { page: pageParam, type } = await searchParams;
  const page = Math.min(500, Math.max(1, Number(pageParam) || 1));
  const filter: GenreFilter =
    type === "movie" || type === "tv" ? type : "all";

  const data = await fetchGenre(slug, filter, page);

  const query = (next: Partial<{ page: number; type: GenreFilter }>) => {
    const search = new URLSearchParams();
    const nextType = next.type ?? filter;
    const nextPage = next.page ?? page;
    if (nextType !== "all") search.set("type", nextType);
    if (nextPage > 1) search.set("page", String(nextPage));
    const qs = search.toString();
    return `/discover/genre/${slug}${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="rise">
      <Link
        href="/discover"
        className="inline-flex items-center gap-1 text-sm text-ink-400 transition hover:text-ink-100"
      >
        <ChevronLeft size={15} /> Discover
      </Link>

      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{genre.label}</h1>
      <p className="mt-1 text-sm text-ink-400">
        {genre.tvId === null
          ? "Movies in this genre, most popular first."
          : "Movies and shows in this genre, most popular first."}
      </p>

      {genre.tvId !== null && (
        <nav className="mt-4 flex flex-wrap gap-2">
          {FILTERS.map((option) => (
            <Link
              key={option.value}
              href={query({ type: option.value, page: 1 })}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                filter === option.value
                  ? "border-flare-500 bg-flare-600/20 text-ink-100"
                  : "border-ink-700 text-ink-300 hover:bg-ink-800 hover:text-ink-100"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </nav>
      )}

      {!data || data.items.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Nothing here" body="TMDB returned no titles for this genre." />
        </div>
      ) : (
        <>
          <PosterGrid items={data.items} />

          <Pager
            page={page}
            totalPages={data.totalPages}
            basePath={`/discover/genre/${slug}`}
            params={filter === "all" ? undefined : { type: filter }}
          />
        </>
      )}
    </div>
  );
}
