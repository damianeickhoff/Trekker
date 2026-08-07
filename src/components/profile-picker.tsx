"use client";

import Image from "next/image";
import { Lock, ShieldCheck } from "lucide-react";
import { useActionState, useState } from "react";
import { cancelProfileChoice, chooseProfile, type ProfileChoiceState } from "@/lib/plex-profile-actions";
import { AuthBackdrop, type Slide } from "./auth-backdrop";

/**
 * "Who's watching?", for a Plex Home.
 *
 * The screen Plex shows after its own sign-in, and for the same reason: one
 * plex.tv login stands for a household, and until somebody says which of them
 * is at the keyboard, everything they watch gets logged against the owner.
 *
 * A grid of faces rather than a list of names, because that is what this is
 * everywhere else it appears and it is recognised before it is read. Choosing
 * is one press for an open profile; a profile with a Plex Home PIN opens the
 * field for it first, since asking everyone for a PIN would teach people to
 * expect one where there is none.
 */

export type Choice = {
  id: string;
  title: string;
  thumb: string | null;
  admin: boolean;
  protected: boolean;
};

export function ProfilePicker({
  profiles,
  slides = [],
}: {
  profiles: Choice[];
  slides?: Slide[];
}) {
  const [state, formAction, pending] = useActionState<ProfileChoiceState, FormData>(
    chooseProfile,
    {},
  );
  /** Which profile is asking for its PIN, or null while none is. */
  const [locked, setLocked] = useState<Choice | null>(null);

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-12">
      <AuthBackdrop slides={slides} />

      <div className="rounded-3xl border border-ink-700/60 bg-ink-850/55 p-6 shadow-2xl shadow-black/40 backdrop-blur-2xl backdrop-saturate-150 sm:p-8 light:bg-white/70">
        <h1 className="text-3xl font-semibold tracking-tight">Who&rsquo;s watching?</h1>
        <p className="mt-2 text-sm text-ink-300">
          This Plex account has a Home. Pick yourself — what you watch is logged against the
          profile you choose, not against the whole household.
        </p>

        <form action={formAction} className="mt-8">
          {locked ? (
            <div className="space-y-4">
              {/*
                A protected profile travels as a hidden field, because the PIN
                entry sits between the press and the submit and by then the
                button that was pressed is long gone.

                It lives inside this branch rather than above the fork, which is
                where it started and where it silently broke every unprotected
                profile: the tiles carry `name="profile"` on the button itself,
                so with a hidden field of the same name sitting earlier in the
                form, `formData.get` answered with the empty one and the action
                could only ever say "pick a profile".
              */}
              <input type="hidden" name="profile" value={locked.id} />
              <div className="flex items-center gap-3">
                <Face profile={locked} size={48} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{locked.title}</p>
                  <p className="text-xs text-ink-400">Protected by a Plex Home PIN</p>
                </div>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium tracking-wide text-ink-300 uppercase">
                  Plex Home PIN
                </span>
                <input
                  name="pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  autoFocus
                  placeholder="••••"
                  className="w-full rounded-xl border border-ink-700 bg-ink-900/70 px-3.5 py-3 text-center font-mono text-lg tracking-[0.4em] outline-none transition focus:border-flare-500 focus:ring-2 focus:ring-flare-600/30"
                />
              </label>

              {state.error && <Problem>{state.error}</Problem>}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="flex-1 rounded-xl bg-flare-600 py-3 text-sm font-semibold text-white transition hover:bg-flare-500 disabled:opacity-60"
                >
                  {pending ? "Checking with Plex…" : `Continue as ${locked.title}`}
                </button>
                <button
                  type="button"
                  onClick={() => setLocked(null)}
                  className="rounded-xl border border-ink-700 px-4 py-3 text-sm font-medium text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
                >
                  Back
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {profiles.map((profile) => (
                  <button
                    key={profile.id}
                    // A protected profile does not submit — it opens the PIN
                    // field instead, and the submit happens from there.
                    type={profile.protected ? "button" : "submit"}
                    name={profile.protected ? undefined : "profile"}
                    value={profile.protected ? undefined : profile.id}
                    disabled={pending}
                    onClick={profile.protected ? () => setLocked(profile) : undefined}
                    className="group flex flex-col items-center gap-2 rounded-2xl p-2 transition hover:bg-ink-800/60 disabled:opacity-60"
                  >
                    <span className="relative">
                      <Face profile={profile} size={64} />
                      {profile.protected && (
                        <span className="absolute -right-1 -bottom-1 grid h-6 w-6 place-items-center rounded-full border border-ink-700 bg-ink-900 text-ink-300">
                          <Lock size={12} />
                        </span>
                      )}
                    </span>
                    <span className="w-full truncate text-center text-xs font-medium">
                      {profile.title}
                    </span>
                  </button>
                ))}
              </div>

              {state.error && <div className="mt-4">
                <Problem>{state.error}</Problem>
              </div>}
            </>
          )}
        </form>

        {/* Honest about what this does and does not protect. A Plex Home
            profile with no PIN is open to anybody holding the owner's Plex
            login — that is Plex's own arrangement, and somebody setting this up
            for a household should know it before they rely on it. */}
        <p className="mt-6 flex items-start gap-2 text-xs text-ink-400">
          <ShieldCheck size={14} className="mt-px shrink-0" />
          Profiles without a Plex Home PIN can be picked by anyone who signed in with this Plex
          account. Set PINs in Plex if these should be kept apart.
        </p>

        <form action={cancelProfileChoice} className="mt-4">
          <button
            type="submit"
            className="w-full text-center text-sm text-ink-400 transition hover:text-ink-100"
          >
            Sign in a different way
          </button>
        </form>
      </div>
    </div>
  );
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
      {children}
    </p>
  );
}

function Face({ profile, size }: { profile: Choice; size: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-flare-600 to-ember-500 text-lg font-black text-white ring-flare-400 transition group-hover:ring-2"
    >
      {profile.thumb ? (
        <Image
          src={profile.thumb}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-cover"
          unoptimized
        />
      ) : (
        profile.title.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
