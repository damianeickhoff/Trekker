import type { Metadata } from "next";
import { SearchScreen } from "@/components/search/search-screen";
import { parseSearchType } from "@/lib/search";

export const metadata: Metadata = { title: "Search" };

/**
 * Search. The sidebar's field and the "/" key land here with the query in
 * place; everything after that happens in the browser against the cached
 * search endpoint. Keyed by the query, so arriving from the sidebar with a new
 * one starts the screen afresh rather than keeping the old box.
 */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const type = parseSearchType(params.type);
  return <SearchScreen key={`${query}|${type}`} initialQuery={query} initialType={type} />;
}
