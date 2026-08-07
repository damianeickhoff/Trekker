"use server";

import { requireUser } from "./auth";
import { getHistoryPage, type HistoryPage } from "./profile";

/** Next page of the watch history, for the infinite-scroll feed. */
export async function loadHistoryPage(page: number): Promise<HistoryPage> {
  const user = await requireUser();
  // Whatever the client sends, it can only ever read its own log.
  return getHistoryPage(user.id, Math.max(1, Math.floor(page)));
}
