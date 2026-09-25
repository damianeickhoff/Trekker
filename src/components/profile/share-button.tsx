"use client";

import { useState } from "react";
import { buttonClass } from "../ui";

/**
 * Hands over the address of this profile: the share sheet where there is one,
 * else the clipboard. Only friends can open it, which the page itself enforces.
 */
export function ShareButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = new URL(path, window.location.origin).href;
    try {
      if (navigator.share) await navigator.share({ url, title: "My Trekker profile" });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Dismissed, or the clipboard refused: nothing to undo.
    }
  }
  return (
    <button type="button" onClick={() => void share()} className={buttonClass("glass", "sm")}>
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
