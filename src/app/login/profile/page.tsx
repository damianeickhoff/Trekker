import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthSlides } from "@/lib/catalogue";
import { HANDOFF_COOKIE, readHandoff } from "@/lib/plex-handoff";
import { ProfilePicker, type Choice } from "@/components/profile-picker";

export const metadata = { title: "Who's watching? — Trekker" };

/**
 * The middle of a Plex sign-in: the account has authenticated, and it turns out
 * to stand for a household rather than a person.
 *
 * Nothing here is reachable without the handoff the callback left behind, and
 * the handoff holds the owner's token — which is why the list of profiles comes
 * out of it rather than being fetched again. The browser is handed names and
 * faces and nothing else; the token stays on the server for the whole flow.
 */
export default async function ChooseProfilePage() {
  const jar = await cookies();
  const handoff = readHandoff(jar.get(HANDOFF_COOKIE)?.value);

  // Arrived here directly, or took longer than the handoff lasts. Either way
  // there is nothing to choose between and the sign-in has to start again.
  if (!handoff) redirect("/login");

  const slides = await getAuthSlides();

  // The owner first, the way Plex orders its own picker: they are the account
  // that just authenticated, so they are the likeliest answer, and a fixed
  // position means the tile does not move around between sign-ins.
  const profiles: Choice[] = handoff.users
    .map((user) => ({
      id: user.id,
      title: user.title,
      thumb: user.thumb,
      admin: user.admin,
      protected: user.protected,
    }))
    .sort((a, b) => Number(b.admin) - Number(a.admin));

  return <ProfilePicker profiles={profiles} slides={slides} />;
}
