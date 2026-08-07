import { redirect } from "next/navigation";
import { LogOut, Server } from "lucide-react";
import { getAdmin } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { avatarUrl } from "@/lib/avatar";
import { logout } from "@/lib/auth-actions";
import { currentSeason } from "@/lib/current-season";
import { db } from "@/lib/db";
import {
  AppearanceSection,
  PlexAccountSection,
  PlexSection,
  ProfileSection,
  SeerrSection,
  SettingsCard,
  TraktSection,
} from "@/components/settings-sections";
import { NotificationsSection } from "@/components/notifications-section";
import { ProviderPicker } from "@/components/provider-picker";
import { KNOWN_PROVIDERS, parseProviders } from "@/lib/providers";
import type { Theme } from "@/components/theme";
import { publicKey } from "@/lib/push";
import { defaultTraktClientId } from "@/lib/trakt";

export const metadata = { title: "Settings — Trekker" };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const admin = await getAdmin();
  const viewerIsAdmin = admin?.id === user.id;

  // Trakt and the viewer's own Plex account are per user, so both come off
  // their row rather than the admin's.
  const account = await db.user.findUnique({
    where: { id: user.id },
    select: {
      traktUsername: true,
      traktClientId: true,
      plexUsername: true,
      plexAuthToken: true,
      theme: true,
      accent: true,
      providers: true,
    },
  });

  // Only so the accent picker can say why it is being overruled at the moment.
  const { season } = await currentSeason();

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

      <ProfileSection name={user.name} email={user.email} avatarUrl={avatarUrl(user)} />
      <AppearanceSection
        theme={(account?.theme ?? "system") as Theme}
        accent={account?.accent ?? "violet"}
        seasonal={season !== null}
      />
      <SettingsCard
        title="Your subscriptions"
        description="Which services you already pay for. Trekker checks before you request something you could watch tonight."
      >
        <div className="mt-4">
          <ProviderPicker
            all={KNOWN_PROVIDERS}
            initial={parseProviders(account?.providers)}
          />
        </div>
      </SettingsCard>

      <NotificationsSection publicKey={publicKey()} />
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
        </>
      ) : (
        <SettingsCard
          title="Servers"
          description={`Plex and Overseerr are set up once for everyone by ${
            admin?.name ?? "the admin"
          }.`}
          icon={<Server size={18} className="text-ink-500" />}
          aside={
            <span className="text-xs text-ink-400">
              {connections?.plexUrl ? "Plex connected" : "Plex not set up"} ·{" "}
              {connections?.seerrUrl ? "Overseerr connected" : "Overseerr not set up"}
            </span>
          }
        />
      )}

      <SettingsCard
        title="Account"
        description="Sign out of this device."
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
    </div>
  );
}
