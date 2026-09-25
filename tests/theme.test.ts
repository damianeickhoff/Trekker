import { describe, expect, it } from "vitest";
import { BOOT_SCRIPT } from "@/lib/boot-script";
import { THEME_COOKIE, parseThemePreference, serverTheme } from "@/lib/theme";

describe("parseThemePreference", () => {
  it("accepts the three stored values", () => {
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("system")).toBe("system");
  });

  it("tolerates case and whitespace, which a hand-edited cookie can carry", () => {
    expect(parseThemePreference(" Light ")).toBe("light");
  });

  it("falls back to dark for anything missing or unreadable", () => {
    expect(parseThemePreference(undefined)).toBe("dark");
    expect(parseThemePreference(null)).toBe("dark");
    expect(parseThemePreference("")).toBe("dark");
    expect(parseThemePreference("violet")).toBe("dark");
  });
});

describe("serverTheme", () => {
  it("renders system as dark, since only the browser can resolve it", () => {
    expect(serverTheme("system")).toBe("dark");
    expect(serverTheme("light")).toBe("light");
    expect(serverTheme("dark")).toBe("dark");
  });
});

describe("boot script", () => {
  // The script runs before paint in a bare page, so it is exercised here
  // against a stand-in document rather than trusted to agree with the parser.
  function run(cookie: string, prefersLight = false, storage: Record<string, string> = {}) {
    const dataset: Record<string, string> = {};
    const document = { cookie, documentElement: { dataset } };
    const matchMedia = () => ({ matches: prefersLight });
    const localStorage = { getItem: (k: string) => storage[k] ?? null };
    new Function("document", "matchMedia", "localStorage", BOOT_SCRIPT)(document, matchMedia, localStorage);
    return dataset;
  }

  it("reads the same cookie the server does", () => {
    expect(run(`${THEME_COOKIE}=light`).theme).toBe("light");
    expect(run(`other=1; ${THEME_COOKIE}=dark`).theme).toBe("dark");
    expect(run("").theme).toBe("dark");
  });

  it("resolves system from the device", () => {
    expect(run(`${THEME_COOKIE}=system`, true).theme).toBe("light");
    expect(run(`${THEME_COOKIE}=system`, false).theme).toBe("dark");
  });

  it("restores a collapsed sidebar and survives storage throwing", () => {
    expect(run("", false, { "trekker:sidebar": "collapsed" }).sidebar).toBe("collapsed");

    const dataset: Record<string, string> = {};
    const throwing = {
      getItem: () => {
        throw new Error("denied");
      },
    };
    new Function("document", "matchMedia", "localStorage", BOOT_SCRIPT)(
      { cookie: `${THEME_COOKIE}=light`, documentElement: { dataset } },
      () => ({ matches: false }),
      throwing,
    );
    expect(dataset.theme).toBe("light");
    expect(dataset.sidebar).toBeUndefined();
  });
});
