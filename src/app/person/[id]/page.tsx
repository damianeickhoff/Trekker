import Image from "next/image";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getWatchStatuses } from "@/lib/stats";
import { getPerson, img, normalise, tmdbConfigured } from "@/lib/tmdb";
import { CreditSection, type Credit } from "@/components/credit-section";
import { BackButton } from "@/components/back-button";
import { PersonBackdrop } from "@/components/person-backdrop";
import { SetupNotice } from "@/components/ui";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const person = tmdbConfigured() ? await getPerson(Number(id)).catch(() => null) : null;
  return { title: person ? `${person.name} — Trekker` : "Trekker" };
}

export default async function PersonPage({ params }: Props) {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isInteger(personId)) notFound();

  if (!tmdbConfigured()) {
    return (
      <div className="rise">
        <SetupNotice />
      </div>
    );
  }

  const person = await getPerson(personId).catch(() => null);
  if (!person) notFound();

  const user = await getCurrentUser();
  const statuses = user ? await getWatchStatuses(user.id) : undefined;

  // One entry per title, best-known first.
  const seen = new Set<string>();
  const credits: Credit[] = [];

  for (const credit of [...person.combined_credits.cast].sort(
    (a, b) => (b.popularity ?? 0) - (a.popularity ?? 0),
  )) {
    const item = normalise(credit);
    if (!item) continue;
    const key = `${item.mediaType}-${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    credits.push({ ...item, character: credit.character });
  }

  // Newest first, so the rail previews recent work rather than a career
  // retrospective. Undated credits (usually unreleased) sort to the front.
  const byRecency = (a: Credit, b: Credit) => Number(b.year ?? "9999") - Number(a.year ?? "9999");

  const movies = credits.filter((c) => c.mediaType === "movie").sort(byRecency);
  const shows = credits.filter((c) => c.mediaType === "tv").sort(byRecency);
  const profile = img.profile(person.profile_path);

  return (
    <>
      {/* One step, not the whole chain: you came here from a title, and that is
          the thing you want back. Outside `.rise` for the reason the title
          page's own note gives — that wrapper animates a transform, which caps
          what the glass on this button can blur. */}
      <BackButton to="back" />

      <div className="rise relative">
      {/* Built from what they are best known for — the credits are already
          sorted by popularity, so the first few are the right few. */}
      <PersonBackdrop posters={credits.slice(0, 3).map((credit) => credit.poster)} />

      <header className="flex flex-col gap-5 pt-2 sm:flex-row sm:gap-6">
        {/* Fixed size, not an aspect ratio: a stretched flex item grows with
            whatever sits beside it and crops the portrait. */}
        <div className="relative mx-auto h-48 w-32 shrink-0 self-start overflow-hidden rounded-2xl border border-ink-700 bg-ink-800 shadow-2xl shadow-black/50 sm:mx-0 sm:h-60 sm:w-40">
          {profile && <Image src={profile} alt="" fill sizes="160px" className="object-cover" />}
        </div>

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{person.name}</h1>
          <p className="mt-1 text-sm text-ink-400">
            {[
              person.known_for_department,
              person.birthday ? `Born ${formatDate(person.birthday)}` : null,
              person.deathday ? `Died ${formatDate(person.deathday)}` : null,
              person.place_of_birth,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>

          {person.biography && (
            <p className="mt-4 line-clamp-6 max-w-2xl text-sm leading-relaxed text-ink-300">
              {person.biography}
            </p>
          )}

          <p className="mt-4 text-xs text-ink-400">
            {credits.length} credited title{credits.length === 1 ? "" : "s"} · {shows.length}{" "}
            show{shows.length === 1 ? "" : "s"} · {movies.length} movie
            {movies.length === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      <CreditSection title="Shows" items={shows} statuses={statuses} />
      <CreditSection title="Movies" items={movies} statuses={statuses} />
      </div>
    </>
  );
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

