"use server";

import { revalidatePath } from "next/cache";
import { isAccent } from "./accents";
import { db } from "./db";
import { getCurrentUser } from "./auth";

/**
 * The theme lives on the account, not in the browser, so the server can put the
 * right value on <html> in the first byte it sends — no inline script, and
 * nothing to flash on a hard reload.
 *
 * Two values are stored: what the user picked, and what it currently resolves
 * to. Only the browser knows what "system" means, so it reports the resolution
 * along with the choice, and again whenever the OS preference changes.
 */
export async function saveTheme(theme: string, resolved: string) {
  const user = await getCurrentUser();
  // Signed out (the sign-in pages have no switcher): nothing to remember.
  if (!user) return;

  const choice = theme === "light" || theme === "dark" ? theme : "system";
  const applied = resolved === "light" ? "light" : "dark";

  await db.user.update({
    where: { id: user.id },
    data: { theme: choice, themeResolved: applied },
  });
}

/**
 * Stored on the account for the same reason as the theme: it has to be on
 * <html> in the first byte, or every violet thing on the page repaints once the
 * client catches up.
 *
 * A seasonal costume overrides this while it is on — see the note in
 * `globals.css`.
 */
export async function saveAccent(accent: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  if (!isAccent(accent)) return { ok: false };

  await db.user.update({ where: { id: user.id }, data: { accent } });
  revalidatePath("/", "layout");
  return { ok: true };
}
