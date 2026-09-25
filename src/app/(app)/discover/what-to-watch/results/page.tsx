import type { Metadata } from "next";
import { ResultsScreen } from "@/components/discover/results";

export const metadata: Metadata = { title: "Tonight's pick" };

/** `/discover/what-to-watch/results?who=solo&kind=tv&vibe=clever&time=hour`, and `roll` and `not` once "Not tonight" has been pressed. */
export default async function ResultsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <ResultsScreen search={await searchParams} />;
}
