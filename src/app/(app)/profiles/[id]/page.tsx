import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Back } from "@/components/back-button";
import { AddButton, AnswerButtons, CancelButton, RemoveFriendButton } from "@/components/friends/buttons";
import { ProfileHero } from "@/components/profile/hero";
import { TopFigures } from "@/components/profile/parts";
import { heroLevel, heroLine, ProfileBody } from "@/components/profile/sections";
import { getCurrentUser } from "@/lib/auth";
import { avatarUrl } from "@/lib/avatar";
import { db } from "@/lib/db";
import { canSeeProfile, relationBetween } from "@/lib/friends";
import { isRangeKey, profileHead, profileTotals, type RangeKey } from "@/lib/profile";
import { sinceLabel } from "@/lib/when";

export const metadata: Metadata = { title: "Profile" };

/**
 * Somebody else's profile. Private until both sides agree: anyone who is not
 * a friend sees the name, the picture and the button to ask; a friend sees the
 * same page as your own, range and all, less what only the owner can do
 * (Edit profile, Share, Badges, the whole history) and less their friends,
 * which are theirs to show. Your own id goes to /profile. Reached from the
 * friends page, a comment, a notification, so the way back goes through
 * history and says "Back".
 */
export default async function OtherProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  if (id === user.id) redirect("/profile");

  const other = await db.user.findUnique({ where: { id }, select: { id: true, name: true, avatarSetAt: true } });
  if (!other) notFound();
  const relation = await relationBetween(user.id, other.id);
  const back = <Back href="/friends" name="Back" history onHero />;
  const person = { id: other.id, name: other.name, avatar: avatarUrl(other) };

  if (!canSeeProfile(relation)) {
    const action =
      relation.kind === "asked" ? (
        <AnswerButtons requestId={relation.id} onHero />
      ) : relation.kind === "requested" ? (
        <CancelButton requestId={relation.id} kind="glass" />
      ) : (
        <AddButton userId={other.id} kind="white" label="Add friend" />
      );
    const line =
      relation.kind === "asked"
        ? "Wants to be friends"
        : relation.kind === "requested"
          ? "Request sent · waiting"
          : "Profiles are private until both sides agree";
    return (
      <>
        <ProfileHero person={person} art={null} line={line} topLeft={back} deskRight={action} />
        <div className="flex flex-col gap-3 px-5 pt-4 lg:hidden">{action}</div>
      </>
    );
  }

  const { range: asked } = await searchParams;
  const range: RangeKey = isRangeKey(asked) ? asked : "all";
  const [head, totals] = await Promise.all([profileHead(other.id), profileTotals(other.id, range)]);
  if (!head) notFound();
  const since = relation.kind === "friends" ? `Friends since ${sinceLabel(relation.since.toISOString())}` : undefined;
  const remove = <RemoveFriendButton userId={other.id} kind="glass" />;

  return (
    <>
      <ProfileHero
        person={person}
        art={head.art}
        line={heroLine(head, since)}
        level={heroLevel(head)}
        topLeft={back}
        phoneRight={remove}
        deskRight={remove}
      />
      {head.plays === 0 ? (
        <p className="m-0 px-5 pt-4 text-[13px] text-ink-2 lg:px-10 lg:pt-6">Nothing watched yet.</p>
      ) : (
        <ProfileBody
          userId={other.id}
          range={range}
          base={`/profiles/${other.id}`}
          own={false}
          plays={head.plays}
          top={<TopFigures totals={totals} range={range} />}
        />
      )}
    </>
  );
}
