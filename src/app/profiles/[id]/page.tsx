import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import {
  friendState,
  getIncomingRequests,
  getOutgoingRequests,
} from "@/lib/friends";
import { achievementTotal, getBadges, getLevel } from "@/lib/achievements";
import { LevelBar } from "@/components/level-bar";
import { compareWith } from "@/lib/comparison";
import { getPublicProfile, getRecentActivity, withArtwork } from "@/lib/social";
import { ComparisonPanel } from "@/components/comparison-panel";
import { FriendButton } from "@/components/friend-buttons";
import { formatHours, formatSpan } from "@/lib/format";
import { getStats } from "@/lib/stats";
import { getFunStats } from "@/lib/fun-stats";
import { ActivityRail } from "@/components/activity-rail";
import { BadgeShelf } from "@/components/achievements";
import { FunStatsPanel } from "@/components/fun-stats";
import { EmptyState, SectionTitle, StatTile } from "@/components/ui";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const profile = await getPublicProfile(id);
  return { title: profile ? `${profile.name} — Trekker` : "Trekker" };
}

export default async function PublicProfilePage({ params }: Props) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");

  const { id } = await params;
  const profile = await getPublicProfile(id);
  if (!profile) notFound();

  // Profiles are private until both sides agree. Someone who is not a friend
  // gets the name and a way to ask, and nothing else.
  const state = await friendState(viewer.id, profile.id);
  if (state !== "friends" && state !== "self") {
    const request =
      state === "incoming"
        ? (await getIncomingRequests(viewer.id)).find((r) => r.person.id === profile.id)
        : state === "requested"
          ? (await getOutgoingRequests(viewer.id)).find((r) => r.person.id === profile.id)
          : undefined;

    return (
      <div className="rise mx-auto max-w-md">
        <Link
          href="/friends"
          className="inline-flex items-center gap-1 text-sm text-ink-400 transition hover:text-ink-100"
        >
          <ChevronLeft size={15} /> Friends
        </Link>

        <div className="card mt-4 grid place-items-center px-6 py-12 text-center">
          <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-flare-600 to-ember-500 text-2xl font-black text-white">
            {profile.avatar ? (
              <Image
                src={profile.avatar}
                alt=""
                width={64}
                height={64}
                className="h-16 w-16 object-cover"
                unoptimized
              />
            ) : (
              profile.name.slice(0, 1).toUpperCase()
            )}
          </span>

          <h1 className="mt-4 text-xl font-semibold tracking-tight">{profile.name}</h1>
          <p className="mt-1.5 max-w-xs text-sm text-ink-400">
            {state === "incoming"
              ? `${profile.name} sent you a friend request. Accept it to see their profile.`
              : state === "requested"
                ? "Your request is waiting for them. You will see their profile once they accept."
                : "This profile is private. Send a friend request to see their stats and activity."}
          </p>

          <div className="mt-5">
            <FriendButton userId={profile.id} requestId={request?.id} state={state} />
          </div>
        </div>
      </div>
    );
  }

  const [stats, activity, funStats, comparison, badges, level] = await Promise.all([
    getStats(profile.id),
    getRecentActivity({ onlyUserId: profile.id, take: 16 }).then(withArtwork),
    getFunStats(profile.id),
    // Your own profile has nothing to compare against.
    state === "self" ? null : compareWith(viewer.id, profile.id),
    getBadges(profile.id, 12),
    getLevel(profile.id),
  ]);

  return (
    <div className="rise">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-ink-400 transition hover:text-ink-100"
      >
        <ChevronLeft size={15} /> Home
      </Link>

      <header className="card relative mt-3 overflow-hidden bg-gradient-to-br from-flare-600/20 via-transparent to-ember-500/12 p-5 sm:p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-flare-500/20 blur-3xl"
        />

        <div className="relative flex flex-wrap items-center gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-flare-600 to-ember-500 text-2xl font-black text-white">
            {profile.avatar ? (
              <Image
                src={profile.avatar}
                alt=""
                width={64}
                height={64}
                className="h-16 w-16 object-cover"
                unoptimized
              />
            ) : (
              profile.name.slice(0, 1).toUpperCase()
            )}
          </span>
          <div className="min-w-0">
            {/* Wraps rather than truncates: a long name should use the width
                the card already has. */}
            <h1 className="text-2xl font-semibold tracking-tight break-words">{profile.name}</h1>
            <p className="text-xs text-ink-400">
              Tracking since{" "}
              {profile.createdAt.toLocaleDateString("en-GB", {
                month: "long",
                year: "numeric",
              })}{" "}
              · <span className="text-ink-300">{formatHours(stats.totalMinutes)} watched</span>
            </p>
          </div>

          {/* The compact bar: how far along someone else is, without the "what
              to do next" line that only makes sense on your own card. */}
          <div className="w-full">
            <LevelBar level={level} compact />
          </div>
        </div>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile accent label="Time watched" value={formatSpan(stats.totalMinutes)} />
        <StatTile
          label="TV time"
          value={formatHours(stats.tvMinutes)}
          sub={`${stats.episodeCount} episodes`}
        />
        <StatTile
          label="Movie time"
          value={formatHours(stats.movieMinutes)}
          sub={`${stats.movieCount} movies`}
        />
        <StatTile label="Shows" value={stats.showCount.toLocaleString("en-GB")} />
      </div>

      {comparison && <ComparisonPanel comparison={comparison} name={profile.name} />}

      <BadgeShelf
        badges={badges}
        total={achievementTotal()}
        // Only your own progress towards the rest is worth a page; on someone
        // else's profile this is a cabinet of what they have won.
        href={state === "self" ? "/achievements" : undefined}
        emptyBody={`${profile.name} has not earned a badge yet.`}
      />

      <FunStatsPanel stats={funStats} />

      <SectionTitle>Recently watched</SectionTitle>
      {activity.length > 0 ? (
        <ActivityRail entries={activity} showWho={false} />
      ) : (
        <EmptyState title="Nothing logged yet" body="This profile has not tracked anything." />
      )}
    </div>
  );
}
