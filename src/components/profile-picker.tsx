"use client";

import { useActionState, useState } from "react";
import { cancelProfileChoice, chooseProfile, type ChoiceState } from "@/lib/plex-profile-actions";
import { Icon } from "./icon";
import { buttonClass, Field } from "./ui";
import { UserAvatar } from "./user-avatar";
import { PRESS } from "./motion";

export type Choice = { id: string; title: string; thumb: string | null; admin: boolean; protected: boolean };

/**
 * "Who is watching?": the faces of the Plex Home that just signed in, as
 * Plex's own apps ask it. A face without a Plex Home PIN signs in on the
 * press; one with a PIN asks for it first, under the faces.
 */
export function ProfilePicker({ profiles }: { profiles: Choice[] }) {
  const [state, action, pending] = useActionState<ChoiceState, FormData>(chooseProfile, {});
  const [chosen, setChosen] = useState<Choice | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-6">
        {/* A face without a PIN submits itself, carrying its own id; the PIN form carries the chosen one. */}
        {chosen?.protected && <input type="hidden" name="chosen" value={chosen.id} />}
        <ul aria-label="Profiles" className="m-0 grid list-none grid-cols-3 gap-x-3 gap-y-5 p-0 sm:grid-cols-4">
          {profiles.map((p) => {
            const on = chosen?.id === p.id;
            return (
              <li key={p.id}>
                <button
                  type={p.protected ? "button" : "submit"}
                  name={p.protected ? undefined : "profile"}
                  value={p.protected ? undefined : p.id}
                  disabled={pending}
                  aria-pressed={on}
                  onClick={() => setChosen(p)}
                  className={`${PRESS} flex w-full flex-col items-center gap-2 border-0 bg-transparent p-0 text-ink disabled:opacity-60`}
                >
                  <span className={`inline-flex rounded-full ${on ? "shadow-[0_0_0_3px_var(--accent)]" : ""}`}>
                    <UserAvatar id={p.id} name={p.title} src={p.thumb?.startsWith("https://") ? p.thumb : null} size={72} />
                  </span>
                  <span className="flex max-w-full items-center gap-1 text-sm font-semibold">
                    <span className="truncate">{p.title}</span>
                    {p.protected && <Icon name="lock" size={13} className="shrink-0 text-ink-3" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {chosen?.protected && (
          <div className="flex flex-col gap-3">
            <Field label={`${chosen.title}'s Plex PIN`} name="pin" type="password" inputMode="numeric" autoComplete="off" autoFocus required />
            <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "w-full")}>
              {pending ? "Signing in" : "Continue"}
            </button>
          </div>
        )}
        {state.error && (
          <p role="alert" className="m-0 text-[13px] font-semibold text-accent-text">
            {state.error}
          </p>
        )}
      </form>
      <form action={cancelProfileChoice}>
        <button type="submit" className={`${PRESS} border-0 bg-transparent p-0 text-xs font-semibold text-ink-2 hover:text-ink`}>
          Not you? Start again
        </button>
      </form>
    </div>
  );
}
