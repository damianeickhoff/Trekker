import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getFriends,
  getIncomingRequests,
  getOutgoingRequests,
  getSuggestedPeople,
  type FriendState,
  type FriendSummary,
} from "@/lib/friends";
import { FriendButton } from "@/components/friend-buttons";
import { EmptyState } from "@/components/ui";

export const metadata = { title: "Friends — Trekker" };

export default async function FriendsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [friends, incoming, outgoing, suggested] = await Promise.all([
    getFriends(user.id),
    getIncomingRequests(user.id),
    getOutgoingRequests(user.id),
    getSuggestedPeople(user.id),
  ]);

  return (
    <div className="rise">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Friends</h1>
      <p className="mt-1 text-sm text-ink-400">
        You can see a profile once you are friends, and only friends turn up in your feed.
      </p>

      {incoming.length > 0 && (
        <section className="mt-7">
          <h2 className="text-lg font-semibold tracking-tight">
            Waiting on you
            <span className="ml-2 rounded-full bg-flare-600/20 px-2 py-0.5 text-xs font-semibold text-flare-300">
              {incoming.length}
            </span>
          </h2>
          <ul className="mt-3 space-y-2">
            {incoming.map((request) => (
              <PersonRow
                key={request.id}
                person={request.person}
                state="incoming"
                requestId={request.id}
                linked={false}
              />
            ))}
          </ul>
        </section>
      )}

      <section className="mt-7">
        <h2 className="text-lg font-semibold tracking-tight">Your friends</h2>
        {friends.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No friends yet"
              body="Send someone a request below. Once they accept, their profile and activity show up for you."
            />
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {friends.map((person) => (
              <PersonRow key={person.id} person={person} state="friends" linked />
            ))}
          </ul>
        )}
      </section>

      {outgoing.length > 0 && (
        <section className="mt-7">
          <h2 className="text-lg font-semibold tracking-tight">Sent</h2>
          <ul className="mt-3 space-y-2">
            {outgoing.map((request) => (
              <PersonRow
                key={request.id}
                person={request.person}
                state="requested"
                requestId={request.id}
                linked={false}
              />
            ))}
          </ul>
        </section>
      )}

      <section className="mt-7">
        <h2 className="text-lg font-semibold tracking-tight">Everyone else here</h2>
        {suggested.length === 0 ? (
          <p className="mt-2 text-sm text-ink-400">
            Nobody left to add — you know everyone on this instance.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {suggested.map((person) => (
              <PersonRow key={person.id} person={person} state="none" linked={false} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PersonRow({
  person,
  state,
  requestId,
  linked,
}: {
  person: FriendSummary;
  state: FriendState;
  requestId?: string;
  /** Only friends' names link through — everyone else's profile is private. */
  linked: boolean;
}) {
  const name = (
    <span className="truncate text-sm font-medium text-ink-100">{person.name}</span>
  );

  return (
    <li className="card flex items-center gap-3 p-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-flare-600 to-ember-500 text-base font-black text-white">
        {person.avatar ? (
          <Image
            src={person.avatar}
            alt=""
            width={44}
            height={44}
            className="h-11 w-11 object-cover"
            unoptimized
          />
        ) : (
          person.name.slice(0, 1).toUpperCase()
        )}
      </span>

      <div className="min-w-0 flex-1">
        {linked ? (
          <Link href={`/profiles/${person.id}`} className="block hover:underline">
            {name}
          </Link>
        ) : (
          name
        )}
        <p className="mt-0.5 truncate text-xs text-ink-400">
          {person.episodeCount.toLocaleString("en-GB")} episodes ·{" "}
          {person.movieCount.toLocaleString("en-GB")} movies
        </p>
      </div>

      <FriendButton
        userId={person.id}
        requestId={requestId}
        state={state}
        size="compact"
      />
    </li>
  );
}
