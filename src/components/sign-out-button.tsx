"use client";

import { signOut } from "@/lib/auth-actions";
import { buttonClass } from "./ui";

/**
 * Tells the service worker to forget cached pages before the cookie goes, so
 * the next launch cannot paint the previous person's Home from cache.
 */
export function SignOutButton() {
  return (
    <form
      action={signOut}
      onSubmit={() => navigator.serviceWorker?.controller?.postMessage({ type: "clear-pages" })}
    >
      <button type="submit" className={buttonClass("ghost", "sm")}>
        Sign out
      </button>
    </form>
  );
}
