import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { freshUser } from "./helpers/db";

describe("harness", () => {
  it("talks to a migrated database", async () => {
    const user = await freshUser();
    expect(user.id).toBeTruthy();
    expect(await db.user.count()).toBe(1);
  });

  it("starts each test empty", async () => {
    expect(await db.user.count()).toBe(0);
  });

  it("can reach a table added by a late migration", async () => {
    expect(await db.deletedPlay.count()).toBe(0);
  });
});
