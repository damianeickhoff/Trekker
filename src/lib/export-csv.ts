/**
 * Turning rows into CSV.
 *
 * Deliberately free of anything server-side, so it can be unit tested without
 * a database — the escaping rules are the whole substance of this file and
 * they are exactly the sort of thing that quietly stops being right.
 *
 * RFC 4180, with CRLF line endings, because that is what the spec says and
 * what Excel expects. A `\n`-only file opens fine nearly everywhere and then
 * fails on the one spreadsheet the user actually has.
 */

/**
 * Cells beginning with these are read as formulas by Excel, Numbers and
 * Sheets. A title like `=1+1` is harmless; `=HYPERLINK(...)` in a file
 * somebody was emailed is not, and neither is `@SUM`. Prefixing an apostrophe
 * is the standard defence: the sheet shows the original text and evaluates
 * nothing.
 *
 * This matters more here than in most exports, because the values are titles
 * that came from TMDB — a third party — rather than from the user.
 */
const FORMULA_LEADERS = ["=", "+", "-", "@", "\t", "\r"];

export type CsvValue = string | number | boolean | Date | null | undefined;

/** One cell, escaped and made inert. */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";

  const text = FORMULA_LEADERS.some((lead) => value.startsWith(lead)) ? `'${value}` : value;

  // Quote whenever the cell could otherwise be misread, and double any quote
  // inside it. Quoting everything would be valid too, but makes a file that is
  // unpleasant to read in a text editor for no gain.
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csvRow(values: CsvValue[]): string {
  return values.map(csvCell).join(",");
}

/**
 * A whole sheet: a header row followed by one row per record.
 *
 * `columns` is an ordered list of `[heading, reader]` so the header and the
 * cells cannot drift apart — the alternative, two parallel arrays, goes wrong
 * the first time somebody inserts a column in the middle.
 */
export function toCsv<T>(columns: [string, (row: T) => CsvValue][], rows: T[]): string {
  const lines = [csvRow(columns.map(([heading]) => heading))];
  for (const row of rows) lines.push(csvRow(columns.map(([, read]) => read(row))));
  return `${lines.join("\r\n")}\r\n`;
}
