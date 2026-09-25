"use server";

import { refresh, updateTag } from "next/cache";
import { getCurrentUser } from "./auth";
import { setFollowing } from "./follow";
import { bellTag } from "./notifications";
import { peekPerson } from "./tmdb";

/**
 * Follow or unfollow someone from their page. The button already shows the
 * new state; `refresh()` re-renders the page from the row, so a failed write
 * puts the truth back. A follow seeds the person's news at once (Round 9), so
 * the bell, whose answer carries the sidebar's News count, is expired too.
 */
export async function followPerson(personId: number, on: boolean): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user || typeof personId !== "number" || !Number.isInteger(personId) || personId <= 0) return false;
  const cached = on === true ? await peekPerson(personId) : null;
  await setFollowing(user.id, personId, on === true, cached);
  updateTag(bellTag(user.id));
  refresh();
  return true;
}
