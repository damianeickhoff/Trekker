"use client";

import { useActionState, useState } from "react";
import { signIn, type SignInState } from "@/lib/auth-actions";
import { Icon } from "./icon";
import { Field, buttonClass } from "./ui";

/**
 * Plex first, because most of a household signs in that way; the password form
 * is for accounts made by hand. The Plex button is a plain link into the PIN
 * flow (`/api/plex/pin`), which leaves for plex.tv and comes back signed in, or
 * to the "who is watching" question for a Plex Home.
 */
export function LoginForm({ plexProblem = null }: { plexProblem?: string | null }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {});
  const [leaving, setLeaving] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {/* A full navigation, not the client router: it leaves for plex.tv. */}
      <a
        href="/api/plex/pin"
        onClick={() => setLeaving(true)}
        className="inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-full border-0 bg-accent px-5 text-[15px] font-bold text-black"
      >
        <Icon name="play" size={18} />
        {leaving ? "Opening Plex" : "Continue with Plex"}
      </a>
      {plexProblem && (
        <p role="alert" className="m-0 text-center text-[13px] font-semibold text-accent-text">
          {plexProblem}
        </p>
      )}

      <div className="flex items-center gap-3 text-xs text-ink-3">
        <span className="h-px grow bg-line" />
        or with a password
        <span className="h-px grow bg-line" />
      </div>

      <form action={action} className="flex flex-col gap-3">
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={state.email}
        />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        {state.error && (
          <p role="alert" className="m-0 text-[13px] font-semibold text-accent-text">
            {state.error}
          </p>
        )}
        <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "w-full")}>
          {pending ? "Signing in" : "Sign in"}
        </button>
      </form>

      <span className="text-center text-xs text-ink-3">New here? Ask whoever runs this Trekker for an invite.</span>
    </div>
  );
}
