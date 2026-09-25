import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { accountsForAdmin, badgesHeldBy } from "@/lib/admin";
import { avatarUrl } from "@/lib/avatar";
import { backgroundFromRow } from "@/lib/background";
import { dailyPoster } from "@/lib/background-art";
import { todayKey } from "@/lib/dates";
import { feedList } from "@/lib/press";
import { regionFor } from "@/lib/providers";
import { vapidPublicKey } from "@/lib/push";
import { regionName, regionOptions } from "@/lib/regions";
import { newsPrefs, ownFeeds, sourcesFor } from "@/lib/news-settings";
import { regionServices, settingsFor } from "@/lib/settings";
import { THEME_COOKIE, parseThemePreference } from "@/lib/theme";
import { defaultTraktClientId } from "@/lib/trakt";
import { importProgress } from "@/lib/trakt-import";
import { Back } from "../back-button";
import { Icon } from "../icon";
import { Link } from "../link";
import { PushToggle } from "../push-toggle";
import { SignOutButton } from "../sign-out-button";
import { ThemePicker } from "../theme-picker";
import { buttonClass } from "../ui";
import { UserAvatar } from "../user-avatar";
import { BadgesTool } from "./badges-tool";
import { ConnectionTile, PlexPanel, PlexSheet, SeerrSheet, TraktSheet } from "./connections";
import { BackgroundPicker, NotifySwitch, RegionSelect, ScreensaverPicker, ServiceChips } from "./controls";
import { DeleteAccount } from "./delete-account";
import { KeepPicker, MarkReadSwitch, NeverSwitch, NewsCard, NewsPushSwitch, NewsSources, OpenOnPicker, StackedRow } from "./news-controls";
import { Fold, SettingsFacts } from "./facts";
import { SECTION_COPY, type NavItem, type SettingsSection } from "./nav-items";
import { SettingsNav } from "./settings-nav";
import { connectionsLine, type SettingFacts } from "./summaries";

/*
 * Settings, every section at every address. Each setting's controls are
 * written once, here, and presented two ways:
 *
 * - Phones (below `lg`) draw the whole page as the old app did: groups under
 *   a mono heading (You, Your accounts elsewhere, This instance), and under
 *   each a stack of folded cards, one per setting, the current state written
 *   on the closed header. The card the address names is open.
 * - Desktops draw one section, the one the address names, beside the list of
 *   all of them; its cards stand open as rows, and the others are not shown.
 *
 * Rows save as they change, with no Save button. Nothing here reaches the
 * network while it renders; the service chips come from the cached provider
 * lists for the region, and ask for them behind the page when there are none.
 */

function Row({ label, sub, children }: { label: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center gap-3 border-b border-line py-2">
      <span className="flex min-w-0 grow flex-col gap-0.5">
        <span className="text-sm font-semibold">{label}</span>
        {sub && <span className="text-xs text-ink-3">{sub}</span>}
      </span>
      {children}
    </div>
  );
}

/**
 * Settings › News's admin card (Round 10): the feeds this instance reads, from
 * `NEWS_FEEDS` or the built-in list, read-only like everything that lives in
 * the server's environment.
 */
function InstanceFeeds() {
  const feeds = feedList();
  const custom = process.env.NEWS_FEEDS !== undefined;
  return (
    <div className="flex min-w-0 flex-col gap-2 pb-3 pt-1">
      <span className="text-xs text-ink-3">
        {feeds.length === 0
          ? "Off for everyone: NEWS_FEEDS is set and empty. Anyone can still add feeds of their own."
          : `${custom ? "From NEWS_FEEDS" : "The built-in list"}: the list everyone picks from. Set NEWS_FEEDS, comma-separated, to replace it; an empty value turns Popular news off for everyone.`}
      </span>
      {/* Width 0 stretched to the column: long addresses scroll inside the block rather than widening the page on a phone. */}
      {feeds.length > 0 && (
        <pre className="m-0 w-0 min-w-full max-w-full overflow-x-auto rounded-xl bg-surface-2 px-3.5 py-3 font-mono text-[12px] leading-[1.7] text-ink-2">
          {feeds.map((f) => f.url).join("\n")}
        </pre>
      )}
    </div>
  );
}

/** A phone's group heading. The desktop names its one section above it instead. */
function GroupHead({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h2 className={`mono-label m-0 pt-4 lg:hidden ${className}`}>{children}</h2>;
}

export async function SettingsScreen({
  userId,
  section,
  plexMessage = null,
  badgesFor,
}: {
  userId: string;
  section: SettingsSection;
  /** The return leg of a Plex link: "linked", or what went wrong. */
  plexMessage?: string | null;
  /** `?u=` on the Badges section: whose badges the admin is looking at. */
  badgesFor?: string;
}) {
  // Today's poster only draws the Artwork preview: the page's own layer has it from the bell.
  const [settings, jar, importing, poster, sources, mine, prefs] = await Promise.all([
    settingsFor(userId),
    cookies(),
    importProgress(userId),
    dailyPoster(userId, todayKey()),
    sourcesFor(userId),
    ownFeeds(userId),
    newsPrefs(userId),
  ]);
  if (!settings) redirect("/login");
  const { user, admin } = settings;
  const preference = parseThemePreference(jar.get(THEME_COOKIE)?.value);
  const services = await regionServices(regionFor(user.region), settings.services);
  const fallbackRegion = regionName(regionFor(null));
  const options = regionOptions();

  const tool =
    admin && section === "badges"
      ? await (async () => {
          const accounts = await accountsForAdmin();
          const chosen = accounts.find((a) => a.id === badgesFor) ?? accounts.find((a) => a.id === user.id) ?? accounts[0];
          return { accounts, chosen, badges: chosen ? await badgesHeldBy(chosen.id) : [] };
        })()
      : null;

  const chosenServices = new Set(settings.services);
  const background = backgroundFromRow(user.background, user.backgroundHue);
  const facts: SettingFacts = {
    theme: preference,
    resolved: preference === "system" ? null : preference,
    background: background.variant,
    screensaver: user.screensaverIdle,
    services: services.filter((s) => chosenServices.has(s.id)).map((s) => s.name),
    region: user.region ? (options.find((o) => o.code === user.region)?.name ?? user.region) : fallbackRegion,
    regionDefault: !user.region,
    push: null,
    friends: user.notifyFriends,
    challenges: user.notifyChallenges,
    news: user.notifyNews,
    newsPeople: user.notifyNewsPeople,
    newsSources: sources.filter((s) => s.enabled).length + mine.filter((f) => f.enabled).length,
  };

  const plexLinked = Boolean(user.plexAccountId);
  const plexConnected = plexLinked || (admin && settings.plexServer);
  const plexStatus = plexLinked
    ? [`Signed in as ${user.plexUsername ?? user.name}`, admin && settings.plexServer ? "server connected" : null].filter(Boolean).join(" · ")
    : admin && settings.plexServer
      ? "Server connected · sign in to log plays as they happen"
      : "Sign in with Plex and plays log themselves";
  const seerrStatus = settings.seerrHost ?? "Request titles for the server";
  const traktStatus = importing.running ? "Importing now" : user.traktUsername ? `History from ${user.traktUsername}` : "Import your history";
  const serversLine = `${settings.plexServer ? "Plex connected" : "Plex not set up"} · ${settings.seerrHost ? "Overseerr connected" : "Overseerr not set up"}`;
  // A managed Plex profile's address is a placeholder nobody should see.
  const who = user.plexManaged ? "Plex profile" : user.email;

  const nav: NavItem[] = [
    { id: "profile", text: [who, admin ? "admin" : null].filter(Boolean).join(" · ") },
    { id: "appearance", line: "appearance" },
    { id: "subscriptions", line: "services" },
    { id: "notifications", line: "notifications" },
    { id: "news", line: "news" },
    {
      id: "connections",
      text: connectionsLine({ Plex: Boolean(plexConnected), Overseerr: settings.seerrHost !== null, Trakt: Boolean(user.traktUsername) }),
    },
    ...(admin ? [{ id: "badges" as const, text: "Admin tool" }] : []),
    { id: "account", text: "Sign out, delete" },
  ];

  /** Shown on a desktop only when it is the section the address names; always on a phone. */
  const shown = (id: SettingsSection) => (section === id ? "lg:gap-1" : "lg:hidden");
  const copy = SECTION_COPY[section];

  return (
    <SettingsFacts initial={facts}>
      <div className="flex flex-col gap-2 px-5 pb-10 lg:grid lg:grid-cols-[300px_minmax(0,760px)] lg:items-start lg:gap-12 lg:px-10 lg:pt-7">
        <div className="flex flex-col gap-[18px] lg:sticky lg:top-7">
          <header className="flex flex-col gap-2 lg:gap-4">
            <div className="flex h-[66px] items-center pt-[22px] lg:h-auto lg:pt-0">
              <Back href="/profile" name="Profile" />
            </div>
            <h1 className="m-0 font-display text-[26px] font-extrabold leading-[1.05] tracking-[-0.035em] lg:text-[30px] lg:font-bold lg:tracking-[-0.025em]">
              Settings
            </h1>
          </header>
          <div className="flex flex-col gap-2 lg:hidden">
            <h2 className="mono-label m-0">You</h2>
            <Link href="/profile/edit" className="flex items-center gap-3.5 rounded-2xl bg-surface p-3 shadow-elevation">
              <UserAvatar id={user.id} name={user.name} src={avatarUrl(user)} size={48} />
              <span className="flex min-w-0 grow flex-col gap-0.5">
                <span className="truncate text-[15px] font-bold">{user.name}</span>
                <span className="truncate text-xs text-ink-3">{[who, admin ? "admin" : null].filter(Boolean).join(" · ")}</span>
              </span>
              <Icon name="chevR" size={18} className="text-ink-3" />
            </Link>
          </div>
          <div className="hidden lg:block">
            <SettingsNav items={nav} current={section} />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2 lg:gap-5">
          <div className="hidden flex-col gap-1 lg:flex">
            <h2 className="m-0 font-display text-2xl font-bold tracking-[-0.025em]">{copy.label}</h2>
            <p className="m-0 text-[13px] text-ink-2">{copy.lede}</p>
          </div>

          {/* The phone's card above stands for this; the desktop gives it the section. */}
          <section aria-label="Profile" className={`hidden ${section === "profile" ? "lg:flex" : ""}`}>
            <div className="flex w-full items-center gap-4 rounded-[18px] bg-surface p-5 shadow-elevation">
              <UserAvatar id={user.id} name={user.name} src={avatarUrl(user)} size={64} />
              <span className="flex min-w-0 grow flex-col gap-1">
                <span className="truncate font-display text-xl font-bold tracking-[-0.02em]">{user.name}</span>
                <span className="truncate text-[13px] text-ink-2">{who}</span>
                <span className="mono-label">{[admin ? "admin" : null, `since ${user.createdAt.getFullYear()}`].filter(Boolean).join(" · ")}</span>
              </span>
              <Link href="/profile/edit" className={buttonClass("ghost", "sm")}>
                <Icon name="pen" size={16} />
                Edit profile
              </Link>
            </div>
          </section>

          <section id="appearance" aria-label="Appearance" className={`flex scroll-mt-6 flex-col gap-2 ${shown("appearance")}`}>
            <Fold icon="sun" title="Appearance" line="theme" open={section === "appearance"}>
              <Row label="Theme" sub="Follows the device when set to System">
                <ThemePicker initial={preference} />
              </Row>
              <div className="flex flex-col gap-3 border-b border-line py-3">
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold">Background</span>
                  <span className="text-xs text-ink-3">Behind every page, on every device you sign in on</span>
                </span>
                <BackgroundPicker initial={background} poster={poster} />
              </div>
            </Fold>
            <Fold icon="monitorPlay" title="Screensaver" line="screensaver">
              <Row
                label="Screensaver"
                sub={
                  <>
                    Artwork, clock and weather after this many minutes without input.{" "}
                    <Link href="/screensaver?from=/settings/appearance" className="font-semibold text-ink-2 underline-offset-2 hover:underline">
                      Start now
                    </Link>
                  </>
                }
              >
                <ScreensaverPicker initial={user.screensaverIdle} />
              </Row>
            </Fold>
          </section>

          <section id="subscriptions" aria-label="Subscriptions" className={`flex scroll-mt-6 flex-col gap-2 ${shown("subscriptions")}`}>
            <Fold icon="tv" title="Your subscriptions" line="services" open={section === "subscriptions"}>
              <p className="m-0 pb-1 pt-3 text-xs text-ink-3 lg:pt-1.5">Request asks first when a title is already on one of these.</p>
              <ServiceChips services={services} initial={settings.services} />
            </Fold>
            <Fold icon="languages" title="Region" line="region">
              <Row label="Region" sub="Which country’s catalogue answers availability">
                <RegionSelect options={options} initial={user.region} fallback={fallbackRegion} />
              </Row>
            </Fold>
          </section>

          <section id="notifications" aria-label="Notifications" className={`flex scroll-mt-6 flex-col gap-2 ${shown("notifications")}`}>
            <Fold icon="bell" title="Notifications" line="notifications" open={section === "notifications"}>
              <Row label="Airing today" sub="One push a day, on this device. The two below need it on.">
                <PushToggle publicKey={vapidPublicKey()} />
              </Row>
              <Row label="Friends and recommendations" sub="The moment they arrive">
                <NotifySwitch topic="friends" initial={user.notifyFriends} label="Push friend requests and recommendations" />
              </Row>
              <Row label="Monthly challenges" sub="New on the first">
                <NotifySwitch topic="challenges" initial={user.notifyChallenges} label="Push the monthly challenges" />
              </Row>
            </Fold>
          </section>

          <section id="news" aria-label="News" className={`flex scroll-mt-6 flex-col gap-2 ${section === "news" ? "lg:gap-5" : "lg:hidden"}`}>
            <Fold icon="clapperboard" title="News" line="news" open={section === "news"} className="min-w-0" bodyClassName="min-w-0 lg:gap-5">
              <NewsSources initialSources={sources.map(({ name, enabled }) => ({ name, enabled }))} initialFeeds={mine} />
              <NewsCard title="Push" meta="This device">
                <Row label="Push me the big ones" sub="Renewals, cancellations and moved dates for what you watch">
                  <NewsPushSwitch topic="news" initial={user.notifyNews} label="Push the big news about what you watch" />
                </Row>
                <Row label="New work from people you follow" sub="Announced or released, once a day at most">
                  <NewsPushSwitch topic="news-people" initial={user.notifyNewsPeople} label="Push new work from people you follow" />
                </Row>
                <Row label="Popular news" sub="Never pushed, only on the page">
                  <NeverSwitch label="Popular news is never pushed" />
                </Row>
              </NewsCard>
              <NewsCard title="Reading">
                <StackedRow label="Open on" sub="Which chip News opens on">
                  <OpenOnPicker initial={prefs.openOn} />
                </StackedRow>
                <Row label="Mark read when opened" sub="Otherwise only Mark all read clears the count">
                  <MarkReadSwitch initial={prefs.markOnOpen} />
                </Row>
                <StackedRow label="Keep stories for" sub="Headlines older than this are dropped from your page">
                  <KeepPicker initial={prefs.keepDays} />
                </StackedRow>
              </NewsCard>
              {admin && (
                <NewsCard title="Feeds on this instance" meta="Admin">
                  <InstanceFeeds />
                </NewsCard>
              )}
            </Fold>
          </section>

          <section id="connections" aria-label="Connections" className={`flex scroll-mt-6 flex-col gap-2 ${section === "connections" ? "lg:gap-5" : "lg:hidden"}`}>
            {/* One tile per service, mounted once: on a phone Overseerr moves under This instance by `order`. */}
            <div className="flex flex-col gap-2 lg:grid lg:grid-cols-3 lg:gap-3">
              <GroupHead>Your accounts elsewhere</GroupHead>
              {/* The return leg of a Plex link lands here with `?plex=`, and opens the sheet to say how it went. */}
              <ConnectionTile name="Plex" icon="play" status={plexStatus} connected={Boolean(plexConnected)} startOpen={Boolean(plexMessage)} open={section === "connections"}>
                <PlexSheet
                  admin={admin}
                  plexName={plexLinked ? (user.plexUsername ?? user.name) : null}
                  canUnlink={user.hasPassword}
                  server={settings.plexHost}
                  syncedAt={user.plexSyncedAt?.toISOString() ?? null}
                  message={plexMessage ? plexMessage.slice(0, 200) : null}
                />
              </ConnectionTile>
              <ConnectionTile name="Overseerr" icon="clock" status={seerrStatus} connected={settings.seerrHost !== null} className="max-lg:order-2">
                <SeerrSheet admin={admin} host={settings.seerrHost} />
              </ConnectionTile>
              <ConnectionTile name="Trakt" icon="history" status={traktStatus} connected={Boolean(user.traktUsername)}>
                <TraktSheet username={user.traktUsername} instanceClientId={Boolean(defaultTraktClientId())} importing={importing} />
              </ConnectionTile>
              <GroupHead className="max-lg:order-1">This instance</GroupHead>
            </div>
            {/* Only where it is the section: the panel asks for the webhook's address when it is shown. */}
            {section === "connections" && (
              <div className="hidden lg:block">
                <PlexPanel
                admin={admin}
                plexName={plexLinked ? (user.plexUsername ?? user.name) : null}
                canUnlink={user.hasPassword}
                server={settings.plexHost}
                  syncedAt={user.plexSyncedAt?.toISOString() ?? null}
                />
              </div>
            )}
          </section>

          {admin ? (
            <section id="badges" aria-label="Badges" className={`flex scroll-mt-6 flex-col gap-2 ${shown("badges")}`}>
              <Fold icon="trophy" title="Badges" text="Admin tool · take a badge back" open={section === "badges"}>
                {tool ? (
                  <BadgesTool accounts={tool.accounts} chosen={tool.chosen} badges={tool.badges} />
                ) : (
                  <Row label="Take a badge back" sub="For testing an achievement twice, or undoing one awarded wrongly">
                    <Link href="/settings/badges" className={buttonClass("ghost", "sm", "h-9! px-4!")}>
                      Open
                    </Link>
                  </Row>
                )}
              </Fold>
            </section>
          ) : (
            // Only a phone has This instance as a group; the desktop's Connections says the same.
            <Fold icon="layers" title="Servers" text={serversLine} className="lg:hidden">
              <p className="m-0 py-3 text-[13px] leading-normal text-ink-2">
                Plex and Overseerr are set up once for everyone by the admin. There is nothing for you to fill in here.
              </p>
            </Fold>
          )}

          <section id="account" aria-labelledby="account-head" className={`flex scroll-mt-6 flex-col gap-1 ${section === "account" ? "" : "lg:hidden"}`}>
            <h2 id="account-head" className="mono-label m-0 pt-4 lg:hidden">
              Account
            </h2>
            <Row label="Sign out" sub="On this device only">
              <SignOutButton />
            </Row>
            <Row label="Delete my account" sub="Everything you logged goes with it">
              <DeleteAccount />
            </Row>
          </section>
        </div>
      </div>
    </SettingsFacts>
  );
}
