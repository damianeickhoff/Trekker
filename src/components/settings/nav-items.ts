import type { IconName } from "../icon";
import type { LineKind } from "./summaries";

/**
 * Settings' sections, each a route of its own (`/settings/appearance`), in
 * the desktop list's order. Badges is the admin's alone. The index is
 * Profile. On a phone every one of these addresses draws the whole page of
 * folded cards, with the section's own card open.
 */
export const SETTINGS_SECTIONS = ["profile", "appearance", "subscriptions", "notifications", "news", "connections", "badges", "account"] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const sectionHref = (id: SettingsSection) => (id === "profile" ? "/settings" : `/settings/${id}`);

export const SECTION_COPY: Record<SettingsSection, { label: string; icon: IconName; lede: string }> = {
  profile: { label: "Profile", icon: "user", lede: "Your name and picture, as friends see them." },
  appearance: { label: "Appearance", icon: "sun", lede: "How Trekker looks on this device, and when the screensaver starts." },
  subscriptions: { label: "Subscriptions", icon: "tv", lede: "What you already pay for, and whose catalogue answers where to watch." },
  notifications: { label: "Notifications", icon: "bell", lede: "What Trekker pushes, and to this device." },
  news: {
    label: "News",
    icon: "clapperboard",
    lede: "Where the headlines come from, which ones reach your phone, and how the page reads. Feeds are read when you open News and after five minutes away; people you follow are checked every hour.",
  },
  connections: { label: "Connections", icon: "layers", lede: "The services Trekker reads from and asks on your behalf." },
  badges: { label: "Badges", icon: "trophy", lede: "Take a badge back, for testing an achievement twice or undoing one awarded wrongly." },
  account: { label: "Account", icon: "lock", lede: "Sign out of this device, or leave for good." },
};

/** One entry of the desktop list: its summary worked out from the facts, or written by the server. */
export type NavItem = { id: SettingsSection; line?: LineKind; text?: string };
