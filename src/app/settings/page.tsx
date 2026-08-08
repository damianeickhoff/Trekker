import { redirect } from "next/navigation";
import { CreditCard, LogOut, Server, Trophy, Users } from "lucide-react";
import { getAdmin } from "@/lib/admin";
import { listAccounts } from "@/lib/admin-actions";
import { getCurrentUser } from "@/lib/auth";
import { periodKey } from "@/lib/challenges/catalogue";
import { avatarUrl } from "@/lib/avatar";
import { logout } from "@/lib/auth-actions";
import { currentSeason } from "@/lib/current-season";
import { db } from "@/lib/db";
import {
  DangerSection,
  ExportSection,
  PasswordSection,
  AppearanceSection,
  PlexAccountSection,
  PlexSection,
  ProfileSection,
  ScreensaverSection,
  SeerrSection,
  SettingsCard,
  SettingsGroup,
  TraktSection,
} from "@/components/settings-sections";
import { AdminAccounts } from "@/components/admin-accounts";
import { AdminBadges } from "@/components/admin-badges";
import { NotificationsSection } from "@/components/notifications-section";
import { ProviderPicker } from "@/components/provider-picker";
import { KNOWN_PROVIDERS, parseProviders } from "@/lib/providers";
import type { Theme } from "@/components/theme";
import { isPlaceholderEmail } from "@/lib/plex-seat";
import { publicKey } from "@/lib/push";
import { defaultTraktClientId } from "@/lib/trakt";

export const metadata = { title: "Settings — Trekker" };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const admin = await getAdmin();
  const viewerIsAdmin = admin?.id === user.id;

  // Only the admin gets the badge tool, so only the admin pays for the list.
  const accounts = viewerIsAdmin ? await listAccounts() : [];

  // Trakt and the viewer's own Plex account are per user, so both come off
  // their row rather than the admin's.
  const account = await db.user.findUnique({
    where: { id: user.id },
    select: {
      traktUsername: true,
      traktClientId: true,
      plexUsername: true,
      plexAuthToken: true,
      passwordHash: true,
      theme: true,
      accent: true,
      providers: true,
      screensaverIdle: true,
      screensaverSource: true,
      screensaverPlace: true,
    },
  });

  // Only so the accent picker can say why it is being overruled at the moment.
  const { season } = await currentSeason();

  // Named rather than counted on the closed header: "Netflix, Disney+" is the
  // answer to "which ones did I tick", and "2 services" is not.
  // A managed Plex Home profile: no address of its own, so nothing on this page
  // should show the placeholder standing in for one.
  const managed = isPlaceholderEmail(user.email);

  const subscriptions = parseProviders(account?.providers);
  const subscriptionNames = KNOWN_PROVIDERS.filter((provider) =>
    subscriptions.includes(provider.id),
  ).map((provider) => provider.name);

  // Server connections live on the admin account and apply to everyone.
  const connections = admin
    ? await db.user.findUnique({
        where: { id: admin.id },
        select: { plexUrl: true, seerrUrl: true },
      })
    : null;

  return (
    <div className="rise mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Settings</h1>
      <p className="mt-1 text-sm text-ink-400">
        Your profile, how Trekker looks, and the servers it talks to.
      </p>

      {/* Three groups, in the order you are likely to want them: who you are,
          what Trekker talks to on your behalf, and what the instance itself is
          wired up to. Every panel is folded with its current state written on
          the closed header, so this whole page reads as nine lines before you
          open anything. */}
      <SettingsGroup title="You">
        <ProfileSection
          name={user.name}
          email={user.email}
          avatarUrl={avatarUrl(user)}
          managed={managed}
        />
        <AppearanceSection
          theme={(account?.theme ?? "system") as Theme}
          accent={account?.accent ?? "violet"}
          seasonal={season !== null}
        />
        <ScreensaverSection
          idle={account?.screensaverIdle ?? 0}
          source={account?.screensaverSource ?? "trending"}
          place={account?.screensaverPlace ?? null}
        />
        <SettingsCard
          title="Your subscriptions"
          description="Which services you already pay for. Trekker checks before you request something you could watch tonight."
          icon={<CreditCard size={16} />}
          active={subscriptions.length > 0}
          summary={
            subscriptions.length > 0
              ? subscriptionNames.join(", ")
              : "None chosen — everything looks like something to request"
          }
        >
          <div className="mt-4">
            <ProviderPicker all={KNOWN_PROVIDERS} initial={subscriptions} />
          </div>
        </SettingsCard>
        <NotificationsSection publicKey={publicKey()} />

        {/* Export sits next to closing the account on purpose: the two are the
            same subject read in either direction, and the copy in the second
            depends on the first being right beside it. */}
        <PasswordSection hasPassword={Boolean(account?.passwordHash)} />
        <ExportSection />
        <DangerSection email={user.email} />
      </SettingsGroup>

      <SettingsGroup title="Your accounts elsewhere">
        <PlexAccountSection
          username={account?.plexUsername ?? null}
          linked={Boolean(account?.plexAuthToken)}
          webhookConfigured={Boolean(process.env.PLEX_WEBHOOK_SECRET?.trim())}
        />
        <TraktSection
          username={account?.traktUsername ?? null}
          hasOwnClientId={Boolean(account?.traktClientId)}
          hasFallbackClientId={Boolean(defaultTraktClientId())}
        />
      </SettingsGroup>

      <SettingsGroup title="This instance">
        {viewerIsAdmin ? (
          <>
            <PlexSection
              connected={Boolean(connections?.plexUrl)}
              plexUrl={connections?.plexUrl ?? null}
            />
            <SeerrSection
              connected={Boolean(connections?.seerrUrl)}
              seerrUrl={connections?.seerrUrl ?? null}
            />

            {/* A maintenance tool rather than a setting: undoing a badge that
                should not have been awarded, and testing one twice without
                inventing a second account. */}
            <SettingsCard
              title="Badges"
              description="Take a badge back from any account, including your own. Only the badge goes — the watch history behind it is left alone."
              icon={<Trophy size={16} />}
              summary="Admin tool"
            >
              <AdminBadges accounts={accounts} self={user.id} period={periodKey(new Date())} />
            </SettingsCard>

            {/* The recovery story for an instance with no email: rename a
                profile, set a new password for somebody locked out, remove an
                account that is finished with. The admin's own account is
                deliberately not offered — its safeguards live under You. */}
            <SettingsCard
              title="Accounts"
              description="The other accounts on this instance: rename one, set a new password for somebody locked out, or remove one for good."
              icon={<Users size={16} />}
              summary={`${accounts.length} on this instance`}
            >
              <div className="mt-4">
                <AdminAccounts accounts={accounts} self={user.id} />
              </div>
            </SettingsCard>
          </>
        ) : (
          <SettingsCard
            title="Servers"
            description={`Plex and Overseerr are set up once for everyone by ${
              admin?.name ?? "the admin"
            }. There is nothing for you to fill in here.`}
            icon={<Server size={16} />}
            active={Boolean(connections?.plexUrl || connections?.seerrUrl)}
            summary={`${connections?.plexUrl ? "Plex connected" : "Plex not set up"} · ${
              connections?.seerrUrl ? "Overseerr connected" : "Overseerr not set up"
            }`}
          />
        )}

        <SettingsCard
          title="Account"
          description="Sign out of this device. Everything you have logged stays where it is."
          icon={<LogOut size={16} />}
          summary={
            managed ? `Signed in as ${user.name}` : `Signed in as ${user.email}`
          }
          aside={
            <form action={logout}>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl border border-ink-700 px-3.5 py-2 text-sm text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
              >
                <LogOut size={15} />
                Sign out
              </button>
            </form>
          }
        />
      </SettingsGroup>
    </div>
  );
}
