import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { isAdmin } from "./admin";
import { getCurrentUser } from "./auth";
import {
  SEASON_COOKIE,
  parseSeasonSetting,
  resolveSeason,
  seasonForDate,
  type SeasonSetting,
} from "./seasons";

/**
 * What the season setting currently is, and what it resolves to.
 *
 * For everybody it is simply "what month is it". The temporary override cookie
 * is honoured for the instance's admin alone, so the dressing can be looked at
 * out of season without every account being able to change what the app looks
 * like — and a cookie set by hand does nothing for anyone else.
 *
 * Memoised per request: the layout asks, and so does any page that wants to
 * dress something of its own.
 */
export const currentSeason = cache(
  async (): Promise<{
    setting: SeasonSetting;
    season: ReturnType<typeof seasonForDate>;
    /** Whether this viewer gets the temporary picker at all. */
    canOverride: boolean;
  }> => {
    const user = await getCurrentUser();
    const allowed = user !== null && (await isAdmin(user.id));

    if (!allowed) {
      return { setting: "auto", season: seasonForDate(), canOverride: false };
    }

    const setting = parseSeasonSetting((await cookies()).get(SEASON_COOKIE)?.value);
    return { setting, season: resolveSeason(setting), canOverride: true };
  },
);
