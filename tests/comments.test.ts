import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { freshUser } from "./helpers/db";

/**
 * Comments and feelings are the first thing on this instance that everybody can
 * read, and every other social query here is friend-gated. That makes the most
 * important case the one no other test in this suite has ever needed: two
 * accounts that are **not** friends can see each other's.
 *
 * If someone later "tidies" these reads by copying the `getFriendIds` gate from
 * `reviews.ts` — which is what every neighbouring module does — the feature
 * quietly becomes a diary and nothing else fails.
 *
 * `requireUser` is mocked rather than worked around: the rules worth pinning
 * live in the actions, not in the tables. Whoever `current` points at is who is
 * posting.
 */

let current = "";

vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ id: current }),
  getCurrentUser: async () => ({ id: current }),
}));

// `revalidatePath` reaches for the request store Next puts around a server
// action, and there is no request here. Nothing under test depends on what it
// does — only that it is called without exploding.
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { postComment, deleteComment, toggleReaction, setFeeling } = await import(
  "@/lib/comment-actions"
);
const { getComments, getFeelings } = await import("@/lib/comments");

let alice: string;
let bob: string;

beforeEach(async () => {
  alice = (await freshUser()).id;
  bob = (await freshUser()).id;
  current = alice;
});

const film = { mediaType: "movie" as const, tmdbId: 550 };

describe("who can read a comment", () => {
  it("shows strangers to each other", async () => {
    // Deliberately no friendship between them. This is the whole feature.
    expect(await db.friendship.count()).toBe(0);

    current = alice;
    await postComment({ ...film, body: "Best one since Homecoming." });

    current = bob;
    const seen = await getComments("movie", 550, bob);

    expect(seen).toHaveLength(1);
    expect(seen[0].body).toBe("Best one since Homecoming.");
    // Bob did not write it, so it offers him no delete.
    expect(seen[0].own).toBe(false);
  });

  it("shows them to somebody signed out", async () => {
    await postComment({ ...film, body: "Worth it for the third act." });

    const seen = await getComments("movie", 550, null);
    expect(seen).toHaveLength(1);
    expect(seen[0].own).toBe(false);
  });

  it("keeps one title's comments out of another's", async () => {
    await postComment({ ...film, body: "About Fight Club." });
    await postComment({ mediaType: "movie", tmdbId: 27205, body: "About Inception." });

    const seen = await getComments("movie", 550, alice);
    expect(seen.map((c) => c.body)).toEqual(["About Fight Club."]);
  });
});

describe("replies go one level deep", () => {
  it("accepts a reply to a comment", async () => {
    const root = await postComment({ ...film, body: "Top level." });
    expect(root.ok).toBe(true);

    const [comment] = await getComments("movie", 550, alice);

    current = bob;
    const reply = await postComment({ ...film, body: "Answering that.", parentId: comment.id });
    expect(reply.error).toBeUndefined();

    const seen = await getComments("movie", 550, alice);
    expect(seen).toHaveLength(1);
    expect(seen[0].replies.map((r) => r.body)).toEqual(["Answering that."]);
  });

  it("refuses a reply to a reply", async () => {
    await postComment({ ...film, body: "Top level." });
    const [comment] = await getComments("movie", 550, alice);
    await postComment({ ...film, body: "A reply.", parentId: comment.id });

    const [again] = await getComments("movie", 550, alice);
    const replyId = again.replies[0].id;

    const nested = await postComment({ ...film, body: "Too deep.", parentId: replyId });

    expect(nested.error).toBe("Replies cannot be replied to");
    expect(await db.comment.count()).toBe(2);
  });

  it("refuses a reply pointed at another title's comment", async () => {
    await postComment({ mediaType: "movie", tmdbId: 27205, body: "Elsewhere." });
    const [elsewhere] = await getComments("movie", 27205, alice);

    const wrong = await postComment({ ...film, body: "Wrong film.", parentId: elsewhere.id });

    expect(wrong.error).toBe("That reply does not belong here");
  });
});

describe("deleting", () => {
  it("takes the replies with it", async () => {
    await postComment({ ...film, body: "Top level." });
    const [comment] = await getComments("movie", 550, alice);

    current = bob;
    await postComment({ ...film, body: "A reply.", parentId: comment.id });

    current = alice;
    await deleteComment(comment.id);

    // The reply was somebody else's, and it still goes: it is an answer to
    // something that no longer exists.
    expect(await db.comment.count()).toBe(0);
  });

  it("refuses somebody else's", async () => {
    await postComment({ ...film, body: "Alice wrote this." });
    const [comment] = await getComments("movie", 550, alice);

    current = bob;
    const refused = await deleteComment(comment.id);

    expect(refused.error).toBe("That is not yours to delete");
    expect(await db.comment.count()).toBe(1);
  });
});

describe("reactions", () => {
  it("toggles the same emoji off and stacks different ones", async () => {
    await postComment({ ...film, body: "React to me." });
    const [comment] = await getComments("movie", 550, alice);

    current = bob;
    await toggleReaction({ commentId: comment.id, emoji: "👍" });
    await toggleReaction({ commentId: comment.id, emoji: "🔥" });

    let seen = await getComments("movie", 550, bob);
    expect(seen[0].reactions.map((r) => r.emoji).sort()).toEqual(["👍", "🔥"]);
    expect(seen[0].reactions.every((r) => r.mine)).toBe(true);

    // The same one again is how you take it back.
    await toggleReaction({ commentId: comment.id, emoji: "👍" });

    seen = await getComments("movie", 550, bob);
    expect(seen[0].reactions.map((r) => r.emoji)).toEqual(["🔥"]);
  });

  it("counts two people once each, and only marks yours as yours", async () => {
    await postComment({ ...film, body: "React to me." });
    const [comment] = await getComments("movie", 550, alice);

    await toggleReaction({ commentId: comment.id, emoji: "👍" });
    current = bob;
    await toggleReaction({ commentId: comment.id, emoji: "👍" });

    const forAlice = await getComments("movie", 550, alice);
    expect(forAlice[0].reactions[0]).toMatchObject({ emoji: "👍", count: 2, mine: true });

    const strangers = await getComments("movie", 550, null);
    expect(strangers[0].reactions[0]).toMatchObject({ count: 2, mine: false });
  });

  it("refuses an emoji that is not in the set", async () => {
    await postComment({ ...film, body: "React to me." });
    const [comment] = await getComments("movie", 550, alice);

    const refused = await toggleReaction({ commentId: comment.id, emoji: "🍕" });

    expect(refused.error).toBe("That reaction does not exist");
    expect(await db.commentReaction.count()).toBe(0);
  });
});

describe("feelings", () => {
  it("tallies everyone and remembers only your own pick", async () => {
    await setFeeling({ ...film, feeling: "tense" });
    current = bob;
    await setFeeling({ ...film, feeling: "tense" });

    const forBob = await getFeelings("movie", 550, bob);
    expect(forBob.tally).toEqual([{ feeling: "tense", count: 2 }]);
    expect(forBob.mine).toBe("tense");

    const strangers = await getFeelings("movie", 550, null);
    expect(strangers.tally).toEqual([{ feeling: "tense", count: 2 }]);
    expect(strangers.mine).toBeNull();
  });

  it("replaces rather than adds, since there is one per person", async () => {
    await setFeeling({ ...film, feeling: "tense" });
    await setFeeling({ ...film, feeling: "loved" });

    const seen = await getFeelings("movie", 550, alice);
    expect(seen.tally).toEqual([{ feeling: "loved", count: 1 }]);
    expect(seen.mine).toBe("loved");
  });

  it("clears when the one you already hold is picked again", async () => {
    await setFeeling({ ...film, feeling: "tense" });
    const cleared = await setFeeling({ ...film, feeling: "tense" });

    expect(cleared.feeling).toBeNull();
    const seen = await getFeelings("movie", 550, alice);
    expect(seen.tally).toEqual([]);
    expect(seen.mine).toBeNull();
  });

  it("refuses a feeling that is not in the catalogue", async () => {
    const refused = await setFeeling({ ...film, feeling: "peckish" });

    expect(refused.error).toBe("That feeling does not exist");
    expect(await db.feeling.count()).toBe(0);
  });
});
