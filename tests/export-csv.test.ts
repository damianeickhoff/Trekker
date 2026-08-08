import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/export-csv";

describe("csvCell", () => {
  it("leaves ordinary text alone", () => {
    expect(csvCell("Fight Club")).toBe("Fight Club");
  });

  it("quotes anything that would otherwise split the row", () => {
    expect(csvCell("Crouching Tiger, Hidden Dragon")).toBe(
      '"Crouching Tiger, Hidden Dragon"',
    );
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
  });

  it("doubles quotes inside a quoted cell", () => {
    expect(csvCell('The "Burbs')).toBe('"The ""Burbs"');
  });

  it("renders the empty things as empty", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(Number.NaN)).toBe("");
  });

  it("writes dates as ISO so a spreadsheet can sort them", () => {
    expect(csvCell(new Date("2026-05-10T20:00:00.000Z"))).toBe("2026-05-10T20:00:00.000Z");
  });
});

describe("csvCell — formula injection", () => {
  /**
   * These titles come from TMDB, not from the user, and the file is something
   * people email to themselves. A cell that Excel evaluates is the one way a
   * data export can do harm.
   */
  it.each(["=1+1", "+SUM(A1)", "-2", "@bad", "\tsneaky"])(
    "makes %j inert without losing it",
    (input) => {
      const cell = csvCell(input);
      expect(cell.replace(/^"|"$/g, "")).toBe(`'${input}`);
    },
  );

  it("does not disturb a title that merely contains a sign", () => {
    expect(csvCell("Fast X + Furious")).toBe("Fast X + Furious");
  });
});

describe("toCsv", () => {
  it("writes a header and one CRLF-terminated row per record", () => {
    const csv = toCsv<{ title: string; score: number }>(
      [
        ["title", (r) => r.title],
        ["score", (r) => r.score],
      ],
      [
        { title: "Heat", score: 84 },
        { title: "Se7en, uncut", score: 87 },
      ],
    );

    expect(csv).toBe('title,score\r\nHeat,84\r\n"Se7en, uncut",87\r\n');
  });

  it("still writes the header for an empty table", () => {
    expect(toCsv<{ a: string }>([["a", (r) => r.a]], [])).toBe("a\r\n");
  });
});
