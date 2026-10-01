import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BOOT_SCRIPT } from "@/lib/boot-script";

/*
 * Artwork that is missing, not yet loaded, or failed: the mark on the second
 * surface (`art-empty`), never a bare grey box or the browser's broken-image
 * icon.
 */

const css = readFileSync(path.join(__dirname, "../src/app/globals.css"), "utf8");

describe("the empty-artwork face", () => {
  it("sits behind every TMDB photo, and behind one that failed", () => {
    expect(css).toMatch(/img\[src\^="https:\/\/image\.tmdb\.org\/t\/p\/"\]\[src\$="\.jpg"\],\s*img\[data-art-missing\]\s*\{\s*background: var\(--surface-2\) var\(--art-mark\)/);
  });

  it("is what a missing poster and a rail's not-yet-drawn poster show", () => {
    expect(css).toMatch(/@utility poster-placeholder \{[^}]*var\(--art-mark\)/);
    const rail = readFileSync(path.join(__dirname, "../src/components/rail.tsx"), "utf8");
    expect(rail).not.toMatch(/bg-surface-2/);
    expect(rail.match(/art-empty/g)?.length).toBe(2);
  });
});

describe("a TMDB picture that fails to load", () => {
  function boot() {
    let onError: ((e: { target: unknown }) => void) | null = null;
    const addEventListener = (type: string, fn: typeof onError, capture: boolean) => {
      if (type === "error" && capture) onError = fn;
    };
    const document = { cookie: "", documentElement: { dataset: {}, style: { setProperty() {} } } };
    new Function("document", "matchMedia", "localStorage", "addEventListener", BOOT_SCRIPT)(
      document,
      () => ({ matches: false }),
      { getItem: () => null },
      addEventListener,
    );
    return (target: unknown) => onError!({ target });
  }

  function img(src: string) {
    const attrs: Record<string, string> = { srcset: "x 1x" };
    return { tagName: "IMG", src, dataset: {} as Record<string, string>, style: {} as Record<string, string>, attrs, removeAttribute: (k: string) => delete attrs[k] };
  }

  it("turns a photo into a transparent pixel marked missing, so the mark shows and no broken icon", () => {
    const fail = boot();
    const photo = img("https://image.tmdb.org/t/p/w342/abc.jpg");
    fail(photo);
    expect(photo.dataset.artMissing).toBe("");
    expect(photo.src).toMatch(/^data:image\/gif;base64,/);
    expect(photo.attrs.srcset).toBeUndefined();
  });

  it("hides a logo, which has no face to fall back to", () => {
    const fail = boot();
    const logo = img("https://image.tmdb.org/t/p/w500/logo.png");
    fail(logo);
    expect(logo.style.visibility).toBe("hidden");
    expect(logo.dataset.artMissing).toBeUndefined();
  });

  it("leaves everyone else's pictures alone", () => {
    const fail = boot();
    const other = img("https://variety.com/picture.jpg");
    fail(other);
    expect(other.src).toBe("https://variety.com/picture.jpg");
    expect(other.dataset.artMissing).toBeUndefined();
    fail({ tagName: "SCRIPT", src: "https://image.tmdb.org/t/p/x.jpg" });
  });
});
