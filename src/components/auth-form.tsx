"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/lib/auth-actions";
import { AuthBackdrop, type Slide } from "./auth-backdrop";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export function AuthForm({
  mode,
  action,
  slides = [],
  notice,
}: {
  mode: "login" | "register";
  action: Action;
  slides?: Slide[];
  /** Error handed back by the Plex round trip, which cannot use form state. */
  notice?: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const isRegister = mode === "register";
  const error = state.error ?? notice;

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-12">
      <AuthBackdrop slides={slides} />

      <div className="rounded-3xl border border-ink-700/60 bg-ink-850/55 p-6 shadow-2xl shadow-black/40 backdrop-blur-2xl backdrop-saturate-150 sm:p-8 light:bg-white/70">
      <Link href="/" className="mb-8 flex items-center gap-3">
        {/* White rather than `text-ink-950`, matching the header mark — see the
            note on it in `nav.tsx`. */}
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-flare-500 to-ember-500 text-lg font-black text-white">
          T
        </span>
        <span className="text-2xl font-semibold tracking-tight">Trekker</span>
      </Link>

      <h1 className="text-3xl font-semibold tracking-tight">
        {isRegister ? "Create your profile" : "Welcome back"}
      </h1>
      <p className="mt-2 text-sm text-ink-300">
        {isRegister
          ? "Your watch history, watchlist and stats live on your own profile."
          : "Sign in to pick up where you left off."}
      </p>

      <form action={formAction} className="mt-8 space-y-4">
        {isRegister && (
          <Field label="Name" name="name" type="text" autoComplete="name" required />
        )}
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete={isRegister ? "new-password" : "current-password"}
          required
          hint={isRegister ? "At least 8 characters" : undefined}
        />

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-flare-600 py-3 text-sm font-semibold text-white transition hover:bg-flare-500 disabled:opacity-60"
        >
          {pending ? "Just a second…" : isRegister ? "Create profile" : "Sign in"}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3 text-[11px] font-medium tracking-wider text-ink-500 uppercase">
        <span className="h-px flex-1 bg-ink-700/70" />
        or
        <span className="h-px flex-1 bg-ink-700/70" />
      </div>

      {/*
        A plain link, not a form: the route redirects to plex.tv, which then
        redirects back. Plex handles the password; Trekker never sees it.
      */}
      {/* Plex's own amber, fixed rather than themed: it is their brand colour
          and it carries black text in both themes. */}
      <a
        href="/api/auth/plex"
        className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#e5a00d] py-3 text-sm font-semibold text-black transition hover:bg-[#f0b024]"
      >
        <PlexMark />
        Continue with Plex
      </a>
      <p className="mt-2 text-center text-xs text-ink-500">
        {isRegister
          ? "Creates a profile from your Plex account. No password to remember."
          : "Signs you in with your plex.tv account."}
      </p>

      <p className="mt-6 text-center text-sm text-ink-400">
        {isRegister ? "Already tracking?" : "New here?"}{" "}
        <Link
          href={isRegister ? "/login" : "/register"}
          className="text-flare-400 hover:text-flare-500"
        >
          {isRegister ? "Sign in" : "Create a profile"}
        </Link>
      </p>
      </div>
    </div>
  );
}

/** Plex's chevron mark, drawn rather than fetched so it inherits the text tone. */
function PlexMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden
      fill="currentColor"
    >
      <path d="M5 2h6l7 10-7 10H5l7-10L5 2z" />
    </svg>
  );
}

function Field({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium tracking-wide text-ink-300 uppercase">
        {label}
      </span>
      <input
        {...props}
        className="w-full rounded-xl border border-ink-700 bg-ink-900/70 px-3.5 py-3 text-sm outline-none transition placeholder:text-ink-600 focus:border-flare-500 focus:ring-2 focus:ring-flare-600/30"
      />
      {hint && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}
    </label>
  );
}
