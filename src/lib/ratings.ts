import "server-only";

/**
 * Rotten Tomatoes scores, via OMDb. TMDB does not carry them, and Rotten
 * Tomatoes has no public API, so OMDb is the practical route: look the title up
 * by its IMDb id and read the Ratings array.
 *
 * Optional — without OMDB_API_KEY the badge simply does not appear.
 */

export type CriticScores = {
  rottenTomatoes: number | null;
  metascore: number | null;
  imdb: number | null;
};

type OmdbResponse = {
  Response: "True" | "False";
  Metascore?: string;
  imdbRating?: string;
  Ratings?: { Source: string; Value: string }[];
};

export function omdbConfigured() {
  return Boolean(process.env.OMDB_API_KEY);
}

export async function getCriticScores(imdbId: string | null): Promise<CriticScores | null> {
  const key = process.env.OMDB_API_KEY;
  if (!key || !imdbId) return null;

  try {
    const url = new URL("https://www.omdbapi.com/");
    url.searchParams.set("i", imdbId);
    url.searchParams.set("apikey", key);
    url.searchParams.set("tomatoes", "true");

    const res = await fetch(url, {
      next: { revalidate: 60 * 60 * 24 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as OmdbResponse;
    if (data.Response !== "True") return null;

    const tomato = data.Ratings?.find((r) => r.Source === "Rotten Tomatoes")?.Value;
    const metascore = Number(data.Metascore);
    const imdb = Number(data.imdbRating);

    return {
      rottenTomatoes: tomato ? Number.parseInt(tomato, 10) : null,
      metascore: Number.isFinite(metascore) ? metascore : null,
      imdb: Number.isFinite(imdb) ? imdb : null,
    };
  } catch {
    return null;
  }
}
