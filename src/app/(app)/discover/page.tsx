import type { Metadata } from "next";
import { DiscoverScreen } from "@/components/discover/discover-page";
import { EmptyNote } from "@/components/discover/parts";
import { DesktopHeader, MobileTop, PageBody } from "@/components/page";
import { parseType } from "@/lib/discover";
import { tmdbConfigured } from "@/lib/tmdb";

export const metadata: Metadata = { title: "Discover" };

/** `/discover`, `?type=tv` or `?type=movie`: the filter reshapes the page and skips what it cannot use. */
export default async function DiscoverPage({ searchParams }: { searchParams: Promise<{ type?: string | string[] }> }) {
  const type = parseType((await searchParams).type);
  if (!tmdbConfigured()) {
    return (
      <>
        <MobileTop title="Discover" />
        <PageBody>
          <DesktopHeader title="Discover" />
          <EmptyNote title="TMDB is not set up">
            Discover reads the catalogue from TMDB. Add <code>TMDB_API_KEY</code> to the server&apos;s environment and restart it.
          </EmptyNote>
        </PageBody>
      </>
    );
  }
  return <DiscoverScreen type={type} />;
}
