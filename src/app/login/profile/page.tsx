import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ProfilePicker, type Choice } from "@/components/profile-picker";
import { Wordmark } from "@/components/ui";
import { HANDOFF_COOKIE, readHandoff } from "@/lib/plex-handoff";

export const metadata: Metadata = { title: "Who is watching?" };

/**
 * The middle of a Plex sign-in whose account turned out to be a household:
 * which of the Plex Home is this? Nothing here is reachable without the
 * handoff the return leg left, and the faces come out of it rather than from
 * plex.tv again. The owner first, as Plex's own picker orders them, so the
 * likeliest answer never moves.
 */
export default async function WhoIsWatchingPage() {
  const jar = await cookies();
  const handoff = readHandoff(jar.get(HANDOFF_COOKIE)?.value);
  if (!handoff) redirect("/login");

  const profiles: Choice[] = handoff.users
    .map((u) => ({ id: u.id, title: u.title, thumb: u.thumb, admin: u.admin, protected: u.protected }))
    .sort((a, b) => Number(b.admin) - Number(a.admin));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col justify-center gap-8 px-5 py-12">
      <Wordmark size={30} />
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 font-display text-[30px] font-bold leading-[1.05] tracking-[-0.025em]">Who is watching?</h1>
        <p className="m-0 text-sm text-ink-2">Everyone in this Plex Home has their own history here.</p>
      </div>
      <ProfilePicker profiles={profiles} />
    </main>
  );
}
