import "server-only";
import { adminId } from "./admin";
import { removeAvatar } from "./avatar";
import { BACKGROUND_HUES, BACKGROUND_VARIANTS, backgroundFromRow, type Background } from "./background";
import { db } from "./db";
import { KNOWN_PROVIDERS, parseProviders } from "./providers";
import { isWatchRegion } from "./regions";
import { cacheKey, tmdbConfigured, tmdbGet, tmdbPeek } from "./tmdb";

/*
 * The writes behind Settings, each validated here rather than trusted from
 * the browser, and the reads that shape its rows. Every write is one column
 * on the account; nothing here reaches TMDB while someone waits.
 */

/** The idle delays Settings offers, in minutes. Zero is off: see `User.screensaverIdle`. */
export const SCREENSAVER_CHOICES = [0, 5, 10, 20, 30] as const;

const KNOWN_IDS = new Set(KNOWN_PROVIDERS.map((p) => p.id));

/**
 * The services someone pays for, by each service's own id. Unknown ids are
 * dropped: the chips offer only `KNOWN_PROVIDERS`, and an id nobody offered
 * is a request made by hand. Nothing chosen is stored as null, which
 * `parseProviders` and the request warning already read as "none named".
 */
export async function setServices(userId: string, ids: unknown): Promise<number[]> {
  const list = Array.isArray(ids) ? ids : [];
  const kept = [...new Set(list.filter((id): id is number => typeof id === "number" && KNOWN_IDS.has(id)))];
  await db.user.update({ where: { id: userId }, data: { providers: kept.length ? kept.join(",") : null } });
  return kept;
}

/**
 * A region of the viewer's own, or null for the instance's `WATCH_REGION`.
 * Choosing the instance's own region by name is stored as that code, not as
 * null: someone who picked it means it, even if the instance later moves.
 */
export async function setRegion(userId: string, code: unknown): Promise<string | null> {
  const region = code === null || code === "" ? null : isWatchRegion(code) ? code : undefined;
  if (region === undefined) throw new Error("Not a region TMDB answers for");
  await db.user.update({ where: { id: userId }, data: { region } });
  return region;
}

export async function setScreensaverIdle(userId: string, minutes: unknown): Promise<number> {
  const value = SCREENSAVER_CHOICES.find((m) => m === minutes);
  if (value === undefined) throw new Error("Not one of the offered delays");
  await db.user.update({ where: { id: userId }, data: { screensaverIdle: value } });
  return value;
}

/**
 * The background variant and the colour swatch, both always sent: the hue is
 * kept whatever the variant, so going back to colour finds the last pick.
 * Anything but the offered variants and hues is refused. Plain is stored as
 * null, which is what every account had before there was a choice.
 */
export async function setBackground(userId: string, variant: unknown, hue: unknown): Promise<Background> {
  if (!(BACKGROUND_VARIANTS as readonly unknown[]).includes(variant)) throw new Error("Not one of the offered backgrounds");
  if (!(BACKGROUND_HUES as readonly unknown[]).includes(hue)) throw new Error("Not one of the offered colours");
  const row = await db.user.update({
    where: { id: userId },
    data: { background: variant === "plain" ? null : (variant as string), backgroundHue: hue as number },
    select: { background: true, backgroundHue: true },
  });
  return backgroundFromRow(row.background, row.backgroundHue);
}

/** "news" is Settings › News's "Push me the big ones", "news-people" its "New work from people you follow" (Round 10). */
export type NotifyTopic = "friends" | "challenges" | "news" | "news-people";

export async function setNotify(userId: string, topic: NotifyTopic, on: boolean) {
  const data =
    topic === "friends"
      ? { notifyFriends: on }
      : topic === "challenges"
        ? { notifyChallenges: on }
        : topic === "news"
          ? { notifyNews: on }
          : topic === "news-people"
            ? { notifyNewsPeople: on }
            : null;
  if (!data) throw new Error("Not a notification topic");
  await db.user.update({ where: { id: userId }, data });
}

type RegionProviders = { results?: { provider_id: number }[] };

const providerListKey = (medium: "movie" | "tv", region: string) => ({
  path: `/watch/providers/${medium}`,
  params: { watch_region: region },
});

/**
 * The services to offer as chips: the known ones TMDB lists for this region,
 * from the cached answers for films and shows. Until those are cached it is
 * every known service, and they are asked for behind the page (not awaited),
 * so the next visit narrows. Services already chosen always stay, so nobody
 * loses a chip they cannot see to take off.
 */
export async function regionServices(region: string, chosen: number[] = []) {
  const [films, shows] = await Promise.all(
    (["movie", "tv"] as const).map((m) => {
      const k = providerListKey(m, region);
      return tmdbPeek<RegionProviders>(k.path, k.params);
    }),
  );
  if ((!films || !shows) && tmdbConfigured()) {
    for (const m of ["movie", "tv"] as const) {
      const k = providerListKey(m, region);
      void tmdbGet("providers", k.path, k.params).catch(() => null);
    }
  }
  if (!films && !shows) return KNOWN_PROVIDERS.map(({ id, name }) => ({ id, name }));
  const listed = new Set([...(films?.results ?? []), ...(shows?.results ?? [])].map((p) => p.provider_id));
  const wanted = new Set(chosen);
  return KNOWN_PROVIDERS.filter((p) => wanted.has(p.id) || p.ids.some((id) => listed.has(id))).map(({ id, name }) => ({ id, name }));
}

/** Exposed for tests, which seed the cache under the same key. */
export function regionProvidersCacheKey(medium: "movie" | "tv", region: string) {
  const k = providerListKey(medium, region);
  return cacheKey(k.path, k.params);
}

/** Everything the Settings page draws for one account, in one read. */
export async function settingsFor(userId: string) {
  const [user, admin] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatarSetAt: true,
        createdAt: true,
        plexManaged: true,
        providers: true,
        region: true,
        screensaverIdle: true,
        notifyFriends: true,
        notifyChallenges: true,
        notifyNews: true,
        notifyNewsPeople: true,
        plexAccountId: true,
        plexUsername: true,
        plexSyncedAt: true,
        passwordHash: true,
        traktUsername: true,
        background: true,
        backgroundHue: true,
      },
    }),
    db.user.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true, plexUrl: true, plexToken: true, seerrUrl: true, seerrApiKey: true },
    }),
  ]);
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return {
    // Whether there is a password, never the hash: the Plex sheet offers Unlink only then.
    user: { ...rest, hasPassword: Boolean(passwordHash) },
    services: parseProviders(user.providers),
    admin: admin?.id === user.id,
    plexServer: Boolean(admin?.plexUrl && admin.plexToken),
    /** Where the server answers, for the Plex sheet: the host only, never the token. */
    plexHost: admin?.plexUrl && admin.plexToken ? hostOf(admin.plexUrl) : null,
    seerrHost: admin?.seerrUrl && admin.seerrApiKey ? hostOf(admin.seerrUrl) : null,
  };
}

function hostOf(url: string) {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `http://${url}`).host;
  } catch {
    return url;
  }
}

/** What has to be typed before an account goes. */
export const DELETE_WORD = "delete";

export type DeleteOutcome = { ok: true } | { ok: false; error: string };

/**
 * Deletes an account and, through the cascades on every table that names a
 * user, everything that was theirs: plays, ratings, lists, badges, friendships
 * in both directions, devices. Shared rows (the TMDB cache, episode lists,
 * availability) belong to nobody and stay. The picture is a file beside the
 * database, so it goes by hand first.
 *
 * The admin cannot go while anyone else is here: the Plex and Overseerr
 * connections live on that account, and deleting it would quietly hand the
 * instance, and the power to take badges back, to the next oldest account.
 */
export async function deleteAccount(userId: string, typed: unknown): Promise<DeleteOutcome> {
  if (typeof typed !== "string" || typed.trim().toLowerCase() !== DELETE_WORD) {
    return { ok: false, error: `Type “${DELETE_WORD}” to confirm.` };
  }
  const [admin, others] = await Promise.all([adminId(), db.user.count({ where: { id: { not: userId } } })]);
  if (admin === userId && others > 0) {
    return { ok: false, error: "The admin account holds the server connections, so it stays while anyone else uses this Trekker." };
  }
  await removeAvatar(userId).catch(() => undefined);
  await db.user.delete({ where: { id: userId } });
  return { ok: true };
}
