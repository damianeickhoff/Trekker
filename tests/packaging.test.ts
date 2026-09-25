import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/*
 * The image and the Unraid template, pinned where they can be without Docker:
 * what the build leaves out, what the container runs on start, and the one
 * route the container's health check calls without a session.
 */

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("the image", () => {
  it("never takes a database, the env file or the local data folder into its build", () => {
    const ignore = read(".dockerignore").split("\n").map((l) => l.trim());
    for (const entry of [".env", "*.db", "data", "node_modules", ".next"]) expect(ignore, entry).toContain(entry);
  });

  it("migrates the mounted database on every start, before the server", () => {
    const entry = read("docker-entrypoint.sh");
    expect(entry).toContain("prisma/build/index.js migrate deploy");
    expect(entry.indexOf("migrate deploy")).toBeLessThan(entry.indexOf('exec "$@"'));
    expect(read("Dockerfile")).toContain('ENV DATABASE_URL="file:/data/trekker.db"');
  });

  it("runs migrations with the same Prisma the app was built with", () => {
    const installed = JSON.parse(read("node_modules/prisma/package.json")).version as string;
    expect(read("Dockerfile")).toContain(`prisma@${installed}`);
  });

  it("carries every migration the old app applied, so an existing volume moves forward", () => {
    const names = readdirSync(path.join(root, "prisma/migrations"));
    expect(names).toContain("20260829120000_feelings_per_episode");
    expect(names).toContain("20260923150000_rebuild_data_layer");
  });
});

describe("the health check", () => {
  it("is outside the sign-in guard, which the container's HEALTHCHECK has no session for", () => {
    expect(read("src/proxy.ts")).toContain("|api/health)");
    expect(read("Dockerfile")).toContain("/api/health");
  });

  const before = process.env.TREKKER_VERSION;
  afterEach(() => {
    process.env.TREKKER_VERSION = before;
  });

  it("reports the build as the short commit the image tag uses, or dev", async () => {
    const { buildVersion } = await import("@/lib/version");
    process.env.TREKKER_VERSION = "0123456789abcdef0123456789abcdef01234567";
    expect(buildVersion()).toBe("0123456");
    process.env.TREKKER_VERSION = "";
    expect(buildVersion()).toBe("dev");
  });
});

describe("the Unraid template", () => {
  it("offers the rebuild's settings and no longer the retired OMDb key", () => {
    const xml = read("unraid/trekker.xml");
    expect(xml).not.toContain("OMDB_API_KEY");
    for (const name of ["AUTH_SECRET", "TMDB_API_KEY", "NEWS_FEEDS", "WEATHER_PLACE", "PLEX_WEBHOOK_SECRET"]) expect(xml, name).toContain(`Name="${name}"`);
    expect(xml).toContain('Target="/data"');
  });
});
