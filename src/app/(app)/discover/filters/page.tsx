import type { Metadata } from "next";
import { FiltersScreen } from "@/components/discover/filters-page";

export const metadata: Metadata = { title: "Filters" };

/**
 * `/discover/filters?genre=horror,thriller&score=70-100&unseen=1&page=2`:
 * every filter is in the address, so a set of them is a link.
 */
export default async function FiltersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <FiltersScreen search={await searchParams} />;
}
