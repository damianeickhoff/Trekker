"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isAdmin } from "./admin";
import { getCurrentUser } from "./auth";
import { SEASON_COOKIE, parseSeasonSetting } from "./seasons";

/**
 * TEMPORARY, alongside the picker in the account menu.
 *
 * A cookie rather than a column on the account: this is a preview switch for
 * looking at the dressing out of season, and it should be possible to delete
 * the whole feature without leaving a migration behind. It is read in the root
 * layout, so every page has to be re-rendered when it changes.
 *
 * Admin only, and checked here rather than only in the menu: hiding the picker
 * hides the button, not the action behind it.
 */
export async function saveSeasonSetting(value: string) {
  const user = await getCurrentUser();
  if (!user || !(await isAdmin(user.id))) return;

  const setting = parseSeasonSetting(value);

  const jar = await cookies();
  jar.set(SEASON_COOKIE, setting, {
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
}
