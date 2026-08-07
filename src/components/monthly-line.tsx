import { formatHours } from "@/lib/format";

/**
 * Hours per month for the last year, as a curve.
 *
 * A line rather than the bars this used to be: twelve bars read as twelve
 * separate facts, and the question the chart answers — is this going up or down
 * — is about the shape between them. The area beneath is what makes a shallow
 * curve legible at this height; without the fill a quiet year is a flat line
 * with nothing to look at.
 *
 * Drawn as one inline SVG with `preserveAspectRatio="none"`, so it stretches to
 * whatever width the card has without a client-side chart library or a resize
 * observer. Strokes are drawn in a second, unscaled overlay — a stretched
 * viewBox would smear the line thickness along with everything else.
 */

const W = 1000;
const H = 260;
/** Room for the curve to breathe without clipping the peak or the dot. */
const PAD_Y = 24;

/**
 * Catmull-Rom through the points, converted to cubic béziers.
 *
 * The obvious alternative — a plain polyline — puts a visible corner at every
 * month, which reads as twelve joined bars rather than one trend. Tension is
 * kept low so the curve cannot overshoot into negative hours on a sharp drop.
 */
function smoothPath(points: { x: number; y: number }[]) {
  if (points.length < 2) return "";

  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }

  return d;
}

export function MonthlyLine({
  series,
  title,
}: {
  series: { label: string; minutes: number }[];
  /** What the axis covers, which the range filter decides. */
  title: string;
}) {
  const peak = Math.max(0, ...series.map((m) => m.minutes));
  const scale = Math.max(1, peak);

  const points = series.map((point, i) => ({
    x: (i / Math.max(1, series.length - 1)) * W,
    y: PAD_Y + (1 - point.minutes / scale) * (H - PAD_Y * 2),
  }));

  const line = smoothPath(points);
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;
  const last = points.at(-1)!;
  const latest = series.at(-1)!;

  // A month of days is thirty-odd labels in the width of a card. Thinning them
  // keeps the axis readable without dropping any data from the line itself.
  const labelEvery = Math.ceil(series.length / 12);

  return (
    <section className="card overflow-hidden p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium tracking-wider text-flare-400 uppercase">
            Your time
          </p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">{title}</h2>
        </div>
        <span className="font-mono text-xs text-ink-400">
          peak {peak > 0 ? formatHours(peak) : "—"}
        </span>
      </div>

      {peak === 0 ? (
        <p className="mt-6 mb-2 text-sm text-ink-500">Nothing logged in this window.</p>
      ) : (
        <>
          <div className="relative mt-5 h-44">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="h-full w-full"
              aria-hidden
            >
              <defs>
                <linearGradient id="monthly-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-flare-500)" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="var(--color-flare-500)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={area} fill="url(#monthly-fill)" />
            </svg>

            {/* The stroke lives in its own square-pixel layer. Sharing the
                stretched viewBox above would scale the line width horizontally
                and leave it a different thickness at either end. */}
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full overflow-visible"
              aria-hidden
            >
              <path
                d={line}
                fill="none"
                stroke="var(--color-flare-400)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {/*
              The latest point, called out. The wrapper is centred exactly on
              the point and holds nothing but the dot — the label hangs off it
              absolutely. An earlier version translated the whole label-plus-dot
              row by -100%, which put the dot's *right edge* on the curve and
              left it visibly beside the line rather than on it.

              Positioned in percentages over the plot rather than drawn into the
              SVG, so the label keeps page-sized text instead of inheriting the
              viewBox's horizontal stretch.
            */}
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${(last.x / W) * 100}%`, top: `${(last.y / H) * 100}%` }}
            >
              <span className="block h-2.5 w-2.5 rounded-full bg-flare-400 ring-4 ring-flare-500/25" />
              <span className="absolute top-1/2 right-full mr-3 -translate-y-1/2 rounded-md bg-ink-950/80 px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap text-ink-100 backdrop-blur-sm light:bg-white/85">
                {formatHours(latest.minutes)}
              </span>
            </div>
          </div>

          <div className="mt-2 flex">
            {series.map((point, i) => (
              <span
                key={i}
                className={`flex-1 text-center text-[10px] ${
                  i === series.length - 1 ? "font-semibold text-ink-200" : "text-ink-500"
                }`}
              >
                {i % labelEvery === 0 || i === series.length - 1 ? point.label : " "}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
