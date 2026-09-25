import type { Tier } from "@/lib/levels";
import { Icon, type IconName } from "../icon";

/*
 * A badge's medal: the tier's metal with a ring around it when earned, the
 * plain surface when not, and the badge's own icon on it either way (the
 * catalogue's `icon`), so an unearned tile says what it is for rather than a
 * row of identical locks. The ring is drawn with the page colour first, so it
 * stands off the medal on any background.
 */

/** Tailwind needs the whole class name in the source to generate it. */
export const TIER_BG: Record<Tier, string> = {
  bronze: "bg-bronze",
  silver: "bg-silver",
  gold: "bg-gold",
  legend: "bg-platinum",
};

export const TIER_VAR: Record<Tier, string> = {
  bronze: "var(--color-bronze)",
  silver: "var(--color-silver)",
  gold: "var(--color-gold)",
  legend: "var(--color-platinum)",
};

export const TIER_NAME: Record<Tier, string> = { bronze: "Bronze", silver: "Silver", gold: "Gold", legend: "Platinum" };

/**
 * The legendary ring, gold into amber. The one gradient on a badge, kept to
 * the top tier so it reads as rare; scoped here rather than in the stylesheet
 * because nothing else draws it.
 */
export const LEGEND_GRADIENT = "linear-gradient(135deg, var(--color-gold), var(--accent) 55%, var(--color-gold))";

export function Medal({
  tier,
  icon = "trophy",
  earned = true,
  size = 46,
  ring = "var(--bg)",
  flourish = false,
  className = "",
}: {
  tier: Tier;
  /** Trophy where the caller does not know the badge, such as a toast cached before icons. */
  icon?: IconName;
  earned?: boolean;
  size?: number;
  /** What the gap in the ring shows: the page, or a toast's own fill. */
  ring?: string;
  /** The badges page's legendary ring; elsewhere a legend medal keeps its plain metal ring. */
  flourish?: boolean;
  className?: string;
}) {
  const disc = (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${
        earned ? `${TIER_BG[tier]} text-white` : "bg-surface-2 text-ink-3"
      } ${flourish ? "" : className}`}
      style={{
        width: size,
        height: size,
        boxShadow: earned && !(flourish && tier === "legend") ? `0 0 0 3px ${ring}, 0 0 0 ${size >= 46 ? 5 : 4}px ${TIER_VAR[tier]}` : undefined,
      }}
    >
      <Icon name={icon} size={Math.round(size * 0.44)} />
    </span>
  );
  if (!(flourish && earned && tier === "legend")) return disc;
  // A box-shadow cannot be a gradient, so the ring is a padded disc behind the
  // gap. The negative margin keeps the medal the size it lays out at, as the
  // shadow ring does, and the ring a touch wider so the gradient reads.
  return (
    <span
      aria-hidden="true"
      className={`-m-1.5 inline-flex shrink-0 rounded-full p-[2.5px] ${className}`}
      style={{ background: LEGEND_GRADIENT }}
    >
      <span className="inline-flex rounded-full p-[3.5px]" style={{ background: ring }}>
        {disc}
      </span>
    </span>
  );
}
