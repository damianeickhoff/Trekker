import { SCORE_PILL, scorePlate } from "@/components/media-card";
import { getCriticScores } from "@/lib/ratings";

/**
 * The scores. Two shapes for the same four numbers.
 *
 * Four slots — IMDb, TMDB's audience, Rotten Tomatoes, Metacritic — but almost
 * no title has all four: Rotten Tomatoes and Metacritic only come from OMDb, and
 * only for films it knows. So both versions are flex rows that centre what they
 * have rather than four-column grids, which would leave holes wherever a source
 * is missing.
 *
 * On a phone they are figures, label above value, which is what the space over
 * the poster wants. On desktop they are the same pill the poster corner wears,
 * tinted by band — the hero is a wide, busy row there and four pills read as one
 * group where four stacked figures read as four separate things.
 *
 * Either way the label is part of the score: 7.5, 89 and 61 are three different
 * scales sitting side by side and nothing else in the row tells them apart.
 */

type Stat = {
  label: string;
  value: string;
  /** Text colour, for the figures. */
  tone: string;
  /** Plate colour, for the pills. */
  plate: string;
  title: string;
};

const GOOD = "text-emerald-400 light:text-emerald-700";
const FAIR = "text-amber-400 light:text-amber-700";
const POOR = "text-red-400 light:text-red-600";

function band(score: number, fair: number, good: number) {
  return score >= good ? GOOD : score >= fair ? FAIR : POOR;
}

export async function ScoreStats({
  imdbId,
  audience,
}: {
  imdbId: string | null;
  /** TMDB's audience score, 0-100. */
  audience: number;
}) {
  const critics = await getCriticScores(imdbId);

  const stats: Stat[] = [];

  if (critics?.imdb != null) {
    stats.push({
      label: "IMDb",
      value: critics.imdb.toFixed(1),
      tone: "text-ember-400 light:text-ember-500",
      // Out of ten, so it has to be scaled before it can be banded with the rest.
      plate: scorePlate(critics.imdb * 10),
      title: "IMDb rating, out of 10",
    });
  }

  if (audience) {
    stats.push({
      label: "User Score",
      value: String(audience),
      tone: band(audience, 50, 70),
      plate: scorePlate(audience),
      title: "TMDB audience score, out of 100",
    });
  }

  if (critics?.rottenTomatoes != null) {
    stats.push({
      label: critics.rottenTomatoes >= 60 ? "Fresh" : "Rotten",
      value: `${critics.rottenTomatoes}%`,
      // Inverted against the others on purpose: on Rotten Tomatoes red is the
      // rotten one, and colouring a 40% green because 40 is a low number would
      // read as the opposite of what the label says.
      tone: critics.rottenTomatoes >= 60 ? GOOD : POOR,
      // Same inversion on the plate: fresh is green whatever the number.
      plate: scorePlate(critics.rottenTomatoes, 60, 60),
      title: "Rotten Tomatoes — share of positive reviews",
    });
  }

  if (critics?.metascore != null) {
    stats.push({
      label: "Metacritic",
      value: String(critics.metascore),
      tone: band(critics.metascore, 40, 61),
      plate: scorePlate(critics.metascore, 40, 61),
      title: "Metacritic score, out of 100",
    });
  }

  if (stats.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap items-start justify-center gap-x-7 gap-y-3 sm:hidden">
        {stats.map((stat) => (
          <div key={stat.label} title={stat.title} className="text-center">
            <p className="text-[11px] font-medium tracking-wide text-ink-100/60">{stat.label}</p>
            <p className={`mt-0.5 text-xl leading-tight font-semibold tabular-nums ${stat.tone}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        {stats.map((stat) => (
          <span key={stat.label} title={stat.title} className={`${SCORE_PILL} ${stat.plate}`}>
            {/* Nearly as bright as the number: the label is half the meaning
                here, since 7.5 and 89 are not on the same scale. */}
            <span className="font-semibold text-white">{stat.label}</span>
            {stat.value}
          </span>
        ))}
      </div>
    </>
  );
}
