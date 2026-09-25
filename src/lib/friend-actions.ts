"use server";

import { refresh, updateTag } from "next/cache";
import { getCurrentUser } from "./auth";
import {
  acceptFriend,
  requestFriend,
  unfriend,
  withdrawRequest,
  type FriendOutcome,
} from "./friends";
import { bellTag } from "./notifications";
import { sendToUser } from "./push";

/*
 * Friend requests from the friends page and profiles. Each write re-renders
 * the page it came from and expires both people's bells, since a request is
 * a notification for one of them and a changed friend count for both.
 */

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length < 64;

function settle(userId: string, otherId: string | null, outcome: FriendOutcome) {
  updateTag(bellTag(userId));
  if (otherId) updateTag(bellTag(otherId));
  refresh();
  return outcome;
}

export async function addFriend(targetId: string): Promise<FriendOutcome> {
  const user = await getCurrentUser();
  if (!user || !isId(targetId)) return { ok: false, error: "Not signed in" };
  const outcome = await requestFriend(user.id, targetId);
  if (outcome.ok && outcome.notify) {
    // The bell's own words, so the push and the bell read as one event. Tagged
    // per requester, so asking again replaces the tray entry. A push service's
    // failure is never the button's. Held back when they turned friend pushes off.
    await sendToUser(outcome.notify, {
      title: `${user.name} wants to be friends`,
      body: "Accept from the friends page",
      url: "/friends",
      tag: `friend-request:${user.id}`,
    }, "friends").catch(() => undefined);
  }
  return settle(user.id, targetId, outcome);
}

export async function acceptRequest(requestId: string): Promise<FriendOutcome> {
  const user = await getCurrentUser();
  if (!user || !isId(requestId)) return { ok: false, error: "Not signed in" };
  return settle(user.id, null, await acceptFriend(user.id, requestId));
}

export async function removeRequest(requestId: string): Promise<FriendOutcome> {
  const user = await getCurrentUser();
  if (!user || !isId(requestId)) return { ok: false, error: "Not signed in" };
  return settle(user.id, null, await withdrawRequest(user.id, requestId));
}

export async function removeFriend(otherId: string): Promise<FriendOutcome> {
  const user = await getCurrentUser();
  if (!user || !isId(otherId)) return { ok: false, error: "Not signed in" };
  return settle(user.id, otherId, await unfriend(user.id, otherId));
}
