import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EXPORTABLE_USER_FIELDS } from "@/lib/export-fields";

/**
 * The release gate on the export.
 *
 * An export is a file people email to themselves and attach to bug reports, so
 * a credential that leaks into one leaks somewhere it can never be recalled.
 * The list is enumerated by hand in `export-fields.ts`; this is what stops the
 * next person widening it without meaning to.
 *
 * Read out of `schema.prisma` rather than hardcoded, so a *new* secret added to
 * `User` in a year's time is caught the moment somebody exports it.
 */

const schema = fs.readFileSync(
  path.resolve(import.meta.dirname, "../prisma/schema.prisma"),
  "utf8",
);

function userFields(): string[] {
  const model = schema.match(/model User \{([\s\S]*?)\n\}/)?.[1] ?? "";
  return model
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("/") && !line.startsWith("@@"))
    .map((line) => line.split(/\s+/)[0]);
}

/** Anything whose name says it is a credential, plus the raw avatar bytes. */
const LOOKS_SENSITIVE = /token|secret|password|hash|apikey|api_key|credential|avatardata/i;

const exportable = Object.keys(EXPORTABLE_USER_FIELDS);

describe("the export's user allowlist", () => {
  it("names only fields that exist on the model", () => {
    const known = new Set(userFields());
    const ghosts = exportable.filter((field) => !known.has(field));
    expect(ghosts).toEqual([]);
  });

  it("lets nothing that looks like a credential out", () => {
    const leaking = exportable.filter((field) => LOOKS_SENSITIVE.test(field));
    expect(leaking).toEqual([]);
  });

  it.each([
    "passwordHash",
    "plexAuthToken",
    "plexToken",
    "seerrApiKey",
    "traktClientId",
    "avatarData",
  ])("keeps %s out by name", (field) => {
    expect(exportable).not.toContain(field);
  });

  it("is an allowlist rather than most of the model", () => {
    // If this ever inverts — more fields in than out — somebody has probably
    // started adding everything and the review above stops being meaningful.
    expect(exportable.length).toBeLessThan(userFields().length);
  });
});
