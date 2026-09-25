import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Back } from "@/components/back-button";
import { AlsoHere, FindPeopleButton } from "@/components/friends/also-here";
import { ExitList } from "@/components/exit-list";
import { AnswerButtons, CancelButton } from "@/components/friends/buttons";
import { Activity, ActivityBones, PersonRow } from "@/components/friends/rows";
import { EmptyState } from "@/components/empty-state";
import { SectionHead } from "@/components/section-head";
import { getCurrentUser } from "@/lib/auth";
import { friendActivity, friendsPage } from "@/lib/friends";
import { agoLabel, sinceLabel } from "@/lib/when";

export const metadata: Metadata = { title: "Friends" };

/**
 * Requests in and out, your friends with how much you have both seen,
 * everyone else here to add, and on desktop what friends watched this week.
 * Profiles are private until both sides agree, and the page says so. Reached
 * from the profile, so the way back names it.
 */
export default async function FriendsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const page = await friendsPage(user.id);
  const requests = page.incoming.length + page.outgoing.length;

  const requestSection = requests > 0 && (
    <Section title="Requests" meta={`${page.incoming.length} in · ${page.outgoing.length} out`}>
      {/* A request answered or cancelled collapses out; the friend it made rises into Your friends (`ExitList`). */}
      <ExitList label="Requests" className="flex flex-col" gap="">
      {page.incoming.map((r) => (
        <PersonRow
          key={r.requestId}
          id={r.id}
          name={r.name}
          avatar={r.avatar}
          line={`Wants to be friends · ${agoLabel(r.at)}`}
          right={<AnswerButtons requestId={r.requestId} />}
        />
      ))}
      {page.outgoing.map((r) => (
        <PersonRow
          key={r.requestId}
          id={r.id}
          name={r.name}
          avatar={r.avatar}
          line={`Sent ${agoLabel(r.at)} · waiting`}
          right={<CancelButton requestId={r.requestId} />}
        />
      ))}
      </ExitList>
    </Section>
  );

  // Nobody else on the instance at all: the empty block under Your friends says so, once.
  const alone = page.others.length === 0 && page.friends.length === 0 && requests === 0;
  const alsoHere = alone ? null : (
    <Section title="Also here" meta={`${page.others.length} ${page.others.length === 1 ? "person" : "people"}`}>
      <AlsoHere people={page.others} />
    </Section>
  );

  return (
    <div className="flex flex-col gap-[18px] px-5 lg:gap-[26px] lg:px-10 lg:pt-7">
      <header className="flex flex-col gap-2 lg:gap-4">
        <div className="flex h-[60px] items-center justify-between pt-4 lg:h-auto lg:pt-0">
          <Back href="/profile" name="Profile" />
          <span className="lg:hidden">
            {!alone && <FindPeopleButton compact />}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <h1 className="m-0 font-display text-[26px] font-extrabold leading-[1.05] tracking-[-0.035em] lg:text-[30px] lg:font-bold lg:tracking-[-0.025em]">
            Friends
          </h1>
          <span className="mono-label hidden lg:inline">profiles are private until both sides agree</span>
          <span className="grow" />
          <span className="hidden lg:inline-flex">
            {!alone && <FindPeopleButton />}
          </span>
        </div>
        <span className="mono-label lg:hidden">profiles are private until both sides agree</span>
      </header>

      <div className="flex flex-col gap-[18px] lg:grid lg:grid-cols-3 lg:items-start lg:gap-10">
        {/* Phones: requests, friends, then everyone else. Desktop: requests over everyone else, friends, the week. */}
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-[22px]">
          {requestSection}
          <div className="order-3 lg:order-none">{alsoHere}</div>
        </div>
        <div className="order-2 min-w-0 lg:order-none">
          <Section title="Your friends" meta={String(page.friends.length)}>
            {page.friends.length === 0 ? (
              <EmptyState
                icon="user"
                title="No friends yet"
                className="mt-1.5"
                action={page.others.length > 0 ? <FindPeopleButton /> : undefined}
              >
                {page.others.length > 0
                  ? "Ask someone under Also here. Once they agree, you each see the other’s profile."
                  : "Friends are the other people on this Trekker, and nobody else has an account here yet."}
              </EmptyState>
            ) : (
              <ExitList label="Your friends" className="flex flex-col" gap="">
              {page.friends.map((f) => (
                <PersonRow
                  key={f.id}
                  id={f.id}
                  name={f.name}
                  avatar={f.avatar}
                  href={`/profiles/${f.id}`}
                  line={`Friends since ${sinceLabel(f.since)} · ${f.shared.toLocaleString("en-GB")} in common`}
                />
              ))}
              </ExitList>
            )}
          </Section>
        </div>
        <div className="hidden min-w-0 lg:block">
          <section className="flex flex-col gap-3.5">
            <SectionHead title="What they watched" meta="this week" />
            <Suspense fallback={<ActivityBones />}>
              <Week userId={user.id} />
            </Suspense>
          </section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, meta, children }: { title: string; meta: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-1">
      <SectionHead title={title} meta={meta} />
      {children}
    </section>
  );
}

async function Week({ userId }: { userId: string }) {
  return <Activity rows={await friendActivity(userId)} />;
}
