/**
 * When something happened, the way the bell and the friends page say it:
 * the time for today, then "Yesterday", the weekday within a week, and a date
 * after that ("1 Sep", with the year once it is not this one). Plain, so both
 * server and client components can use it.
 */
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function daysAgo(at: Date, now: Date) {
  return Math.round((midnight(now) - midnight(at)) / 86_400_000);
}

export function whenLabel(iso: string, now = new Date(), { today = "time" }: { today?: "time" | "word" } = {}) {
  const at = new Date(iso);
  const n = daysAgo(at, now);
  if (n <= 0) return today === "word" ? "Today" : `${at.getHours()}:${String(at.getMinutes()).padStart(2, "0")}`;
  if (n === 1) return "Yesterday";
  if (n < 7) return WEEKDAYS[at.getDay()];
  return at.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(at.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** "2 days ago", "just now": for requests, where how long it has waited is the point. */
export function agoLabel(iso: string, now = new Date()) {
  const at = new Date(iso);
  const minutes = Math.round((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const n = daysAgo(at, now);
  if (n <= 0) return `${Math.round(minutes / 60)} h ago`;
  if (n === 1) return "yesterday";
  if (n < 14) return `${n} days ago`;
  return at.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** "Friends since March", or the year once it is not this one. */
export function sinceLabel(iso: string, now = new Date()) {
  const at = new Date(iso);
  return at.getFullYear() === now.getFullYear()
    ? at.toLocaleDateString("en-GB", { month: "long" })
    : String(at.getFullYear());
}

/** "12 min", "3 h", "4 d": a headline's age beside its source ("Variety · 3 h"), where the day it was written matters less than how fresh it is. */
export function shortAgo(iso: string, now = new Date()) {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}
