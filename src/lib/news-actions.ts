"use server";

import { updateTag } from "next/cache";
import { getCurrentUser } from "./auth";
import { markNewsRead } from "./news";
import { bellTag } from "./notifications";
import { refreshNewsOnDemand } from "./refresh";

/** The News page's Mark all read. Expires this person's bell, whose count the sidebar shows. */
export async function readAllNews(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await markNewsRead(user.id);
  updateTag(bellTag(user.id));
}

/**
 * The News page's refresh on demand, called after it has painted: feeds read
 * again if five minutes old, followed people looked at again if an hour old
 * (`refreshNewsOnDemand`). Only `/news` calls it; Home's rail and the bell
 * read rows only. Says whether anything new was stored, so the page knows
 * whether to draw itself again. A look at followed people can change the
 * bell's count, so it is expired when one ran.
 *
 * `force` is the page's Refresh button (Round 10): the feeds are read even
 * inside their five minutes.
 */
export async function refreshNews(force: boolean = false): Promise<{ checked: boolean; added: number }> {
  const user = await getCurrentUser();
  if (!user) return { checked: false, added: 0 };
  const result = await refreshNewsOnDemand(Date.now(), { force: force === true }).catch(() => null);
  if (!result) return { checked: false, added: 0 };
  if (result.people && result.added > 0) updateTag(bellTag(user.id));
  return { checked: result.press || result.people, added: result.added };
}
