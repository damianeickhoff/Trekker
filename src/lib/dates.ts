/**
 * Air dates are plain `YYYY-MM-DD` strings throughout, as TMDB gives them. They
 * carry no time or zone, and turning them into Date objects is how an episode
 * ends up on the wrong day for anyone west of UTC. Comparing the strings is
 * both correct and cheap, which is also what lets SQLite index them.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Today where the server is, which for a self-hosted instance is where the
 * household is. `en-CA` is used only because it formats as YYYY-MM-DD.
 */
export function todayKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** The Monday of the week containing `date`: weeks start on Monday in en-GB. */
export function startOfWeek(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

export function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Whole days from one date key to another; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Parts of a date key, read as a calendar date rather than an instant. */
export function dateParts(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  return {
    year: d.getUTCFullYear(),
    month: MONTHS[d.getUTCMonth()],
    day: d.getUTCDate(),
    weekday: WEEKDAYS[d.getUTCDay()],
  };
}

/** "Wednesday 23 September". */
export function longDate(date: string): string {
  const p = dateParts(date);
  return `${p.weekday} ${p.day} ${p.month}`;
}

/**
 * When something was watched, on a chip: "Today", "Yesterday", the weekday
 * within the last six days, then "1 Mar 26". The year is always on the date,
 * because a rail of the latest viewings can reach back years after a quiet
 * spell and "1 Mar" alone would read as this March.
 */
export function watchedWhen(date: string, today: string): string {
  const n = daysBetween(date, today);
  if (n <= 0) return "Today";
  if (n === 1) return "Yesterday";
  if (n < 7) return dateParts(date).weekday;
  const p = dateParts(date);
  return `${p.day} ${p.month.slice(0, 3)} ${String(p.year).slice(2)}`;
}

/** "Wed 23". */
export function shortDay(date: string): string {
  const p = dateParts(date);
  return `${p.weekday.slice(0, 3)} ${p.day}`;
}

/**
 * When something lands, the way people say it: "Today", "Tomorrow", the
 * weekday inside a week, then "in 9 days" and "in 3 weeks". Exact dates read
 * as homework; this is how a household talks about what is on.
 */
export function landingWhen(date: string, today: string): string {
  const n = daysBetween(today, date);
  if (n <= 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n < 7) return dateParts(date).weekday;
  if (n < 14) return `in ${n} days`;
  return `in ${Math.floor(n / 7)} weeks`;
}

/** The agenda's heading beside each day: "Yesterday", "Today", "In 2 days". */
export function relativeDay(date: string, today: string): string {
  const n = daysBetween(today, date);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  return n > 0 ? `In ${n} days` : `${-n} days ago`;
}

/** When an episode came out, for the Up next card: "Aired Sunday", "Aired 3 Mar". */
export function airedWhen(date: string, today: string): string {
  const n = daysBetween(date, today);
  if (n <= 0) return "Out today";
  if (n === 1) return "Aired yesterday";
  if (n < 7) return `Aired ${dateParts(date).weekday}`;
  const p = dateParts(date);
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return `Aired ${p.day} ${p.month.slice(0, 3)}${sameYear ? "" : ` ${p.year}`}`;
}

/**
 * A chosen day, as a timestamp at midday server time. A date picked for "when
 * did I watch this" has no time, and midday is the one hour that stays on the
 * same calendar day whichever side of a clock change or a few hours of zone
 * difference it is read from.
 */
export function localMidday(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** "21 – 27 September 2026", or across a month or year where the week is. */
export function weekRange(start: string): string {
  const end = addDays(start, 6);
  const a = dateParts(start);
  const b = dateParts(end);
  if (a.year !== b.year) return `${a.day} ${a.month} ${a.year} – ${b.day} ${b.month} ${b.year}`;
  if (a.month !== b.month) return `${a.day} ${a.month} – ${b.day} ${b.month} ${b.year}`;
  return `${a.day} – ${b.day} ${b.month} ${b.year}`;
}

export type Week = {
  /** Monday. */
  start: string;
  /** Sunday. */
  end: string;
  days: string[];
  previous: string;
  next: string;
  /** How far this week is from the current one, in weeks. */
  offset: number;
  /** "This week", "Next week", "Last week", or "Week of 5 October". */
  title: string;
  range: string;
};

/**
 * The week `?w=` asks for. Any day inside a week names that week, so a link can
 * carry whatever date it has to hand; anything unreadable is this week. Weeks
 * run Monday to Sunday.
 */
export function resolveWeek(param: string | string[] | undefined, today: string): Week {
  const raw = Array.isArray(param) ? param[0] : param;
  const valid = isDateKey(raw) && !Number.isNaN(Date.parse(`${raw}T00:00:00Z`)) && addDays(raw, 0) === raw;
  const start = startOfWeek(valid ? raw : today);
  const offset = Math.round(daysBetween(startOfWeek(today), start) / 7);
  const p = dateParts(start);
  const title =
    offset === 0 ? "This week" : offset === 1 ? "Next week" : offset === -1 ? "Last week" : `Week of ${p.day} ${p.month}`;
  return {
    start,
    end: addDays(start, 6),
    days: Array.from({ length: 7 }, (_, i) => addDays(start, i)),
    previous: addDays(start, -7),
    next: addDays(start, 7),
    offset,
    title,
    range: weekRange(start),
  };
}

/**
 * When something happened, the way people say it: "today", "yesterday", the
 * weekday within the week, then "12 Mar", with the year once it is not this one.
 */
export function pastDay(date: string, today: string): string {
  const n = daysBetween(date, today);
  if (n <= 0) return "today";
  if (n === 1) return "yesterday";
  const p = dateParts(date);
  if (n < 7) return p.weekday;
  return `${p.day} ${p.month.slice(0, 3)}${date.slice(0, 4) === today.slice(0, 4) ? "" : ` ${p.year}`}`;
}

/** "Sun 27 Sep": an air date in a list, where the weekday is what people plan by. */
export function listDate(date: string): string {
  const p = dateParts(date);
  return `${p.weekday.slice(0, 3)} ${p.day} ${p.month.slice(0, 3)}`;
}
