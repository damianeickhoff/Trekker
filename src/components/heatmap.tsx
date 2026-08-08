import type { Heatmap } from "@/lib/heatmap";
import { PanelHead } from "./profile-panels";

/**
 * A year of watching as a grid: weeks across, days down.
 *
 * Coloured from the accent by the same trick the balance bar uses — one colour
 * mixed towards the page in steps — so it follows whatever the user picked and
 * needs no second rule for light mode. Five levels, because the eye cannot read
 * more than that in a 10px square, and the number is in the tooltip anyway for
 * anyone who wants it.
 */

/** Minutes, as a share of the busiest day, for each step up the scale. */
const STEPS = [0, 0.15, 0.35, 0.6, 0.85];

function level(minutes: number, peak: number) {
  if (minutes <= 0) return 0;
  if (peak <= 0) return 1;

  const share = minutes / peak;
  // Walked from the top so the busiest day always lands on the last step.
  for (let i = STEPS.length - 1; i >= 1; i -= 1) {
    if (share >= STEPS[i]) return i + 1;
  }
  return 1;
}

function eachDay(from: string, to: string) {
  const days: string[] = [];
  const cursor = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);

  while (cursor <= end) {
    const year = cursor.getFullYear();
    const month = String(cursor.getMonth() + 1).padStart(2, "0");
    const day = String(cursor.getDate()).padStart(2, "0");
    days.push(`${year}-${month}-${day}`);
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function HeatmapPanel({ heatmap }: { heatmap: Heatmap }) {
  if (heatmap.total === 0) return null;

  const minutes = new Map(heatmap.days.map((day) => [day.date, day]));
  const all = eachDay(heatmap.from, heatmap.to);

  /**
   * Split into columns of seven, Monday first — matching the weekday chart
   * elsewhere on this page. The range already starts on a Monday, so every
   * column but the last is full.
   */
  const weeks: string[][] = [];
  for (let i = 0; i < all.length; i += 7) weeks.push(all.slice(i, i + 7));

  return (
    <section className="card p-5">
      <PanelHead
        eyebrow="The year"
        title="Every day you watched something"
      />

      {/* Scrolls on a phone rather than shrinking the squares to nothing: a
          53-week grid is about 640px at a legible size, and a 4px square is a
          smudge. The row bleeds to the card's edges so it reads as scrollable. */}
      <div className="-mx-5 mt-4 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="min-w-max">
          {/* Month labels sit above the week their first day falls in. */}
          <div className="mb-1 flex gap-[3px]">
            {weeks.map((week, i) => {
              const first = week.find((date) => date.endsWith("-01"));
              const previous = weeks[i - 1]?.some((date) => date.endsWith("-01"));

              return (
                <span key={i} className="w-[11px] shrink-0 text-[9px] text-ink-500">
                  {first && !previous ? MONTHS[Number(first.slice(5, 7)) - 1] : ""}
                </span>
              );
            })}
          </div>

          <div className="flex gap-[3px]">
            {weeks.map((week, i) => (
              <div key={i} className="flex flex-col gap-[3px]">
                {week.map((date) => {
                  const day = minutes.get(date);
                  const step = level(day?.minutes ?? 0, heatmap.peak);

                  return (
                    <span
                      key={date}
                      className={`h-[11px] w-[11px] rounded-[3px] heat-${step}`}
                      title={
                        day
                          ? `${date} — ${day.minutes} min across ${day.plays} viewing${
                              day.plays === 1 ? "" : "s"
                            }`
                          : `${date} — nothing`
                      }
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-ink-500">
        <span>
          {heatmap.days.length} day{heatmap.days.length === 1 ? "" : "s"} watched
        </span>
        <span className="flex items-center gap-1.5">
          Less
          {[0, 1, 2, 3, 4, 5].slice(1).map((step) => (
            <span key={step} className={`h-[10px] w-[10px] rounded-[3px] heat-${step}`} />
          ))}
          More
        </span>
      </div>
    </section>
  );
}
