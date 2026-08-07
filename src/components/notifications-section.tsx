"use client";

import { Bell, BellOff, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { SettingsCard } from "./settings-sections";

/**
 * Reminders for what is on tonight, per device rather than per account — you
 * want your phone to buzz, not the laptop you left at the office.
 */
export function NotificationsSection({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<"unknown" | "unsupported" | "on" | "off">("unknown");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;

    // Whether this device is registered is the browser's answer, not ours —
    // clearing site data unsubscribes it without telling the server. Kept in a
    // promise chain so nothing sets state during the effect itself.
    Promise.resolve()
      .then(() => {
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
        return navigator.serviceWorker
          .getRegistration()
          .then((registration) => registration?.pushManager.getSubscription() ?? null);
      })
      .then((subscription) => {
        if (!live) return;
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
          setState("unsupported");
        } else {
          setState(subscription ? "on" : "off");
        }
      })
      .catch(() => live && setState("off"));

    return () => {
      live = false;
    };
  }, []);

  async function enable() {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError(
          permission === "denied"
            ? "This browser is blocking notifications for Trekker. Allow them in its site settings and try again."
            : "Notifications were not allowed.",
        );
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        // Chrome refuses anything else, and it is what the spec recommends.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const json = subscription.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          label: navigator.userAgent.slice(0, 120),
        }),
      });

      if (!res.ok) throw new Error("The server would not accept this device");

      setState("on");
      setMessage("This device will get a nudge when something you watch is on.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not turn notifications on");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();

      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => undefined);
        await subscription.unsubscribe();
      }

      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setError(null);
    setMessage(null);
    const res = await fetch("/api/push/test", { method: "POST" });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (res.ok) setMessage("Sent — it should appear in a moment.");
    else setError(body?.error ?? "Could not send a test notification");
  }

  const description = !publicKey
    ? "Not set up on this instance. Generate a VAPID key pair and set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY."
    : state === "unsupported"
      ? "This browser cannot receive push notifications. On iOS, add Trekker to your home screen first."
      : "A single nudge on the days something you watch is airing.";

  return (
    <SettingsCard
      title="Notifications"
      description={description}
      icon={
        state === "on" ? (
          <Bell size={18} className="text-flare-400" />
        ) : (
          <BellOff size={18} className="text-ink-500" />
        )
      }
      aside={
        state === "on" ? (
          <span className="flex items-center gap-1.5 text-xs text-fresh-500">
            <CheckCircle2 size={14} /> On for this device
          </span>
        ) : null
      }
    >
      {publicKey && state !== "unsupported" && (
        <div className="mt-4 space-y-3">
          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
          {message && (
            <p className="rounded-lg border border-fresh-500/30 bg-fresh-500/10 px-3 py-2 text-sm text-fresh-500">
              {message}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {state === "on" ? (
              <>
                <button
                  type="button"
                  onClick={disable}
                  disabled={busy}
                  className="rounded-xl border border-ink-700 px-4 py-2.5 text-sm text-ink-300 transition hover:bg-ink-800 hover:text-ink-100 disabled:opacity-60"
                >
                  Turn off on this device
                </button>
                <button
                  type="button"
                  onClick={test}
                  disabled={busy}
                  className="rounded-xl border border-ink-700 px-4 py-2.5 text-sm text-ink-300 transition hover:bg-ink-800 hover:text-ink-100 disabled:opacity-60"
                >
                  Send a test
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={enable}
                disabled={busy || state === "unknown"}
                className="rounded-xl bg-flare-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-flare-500 disabled:opacity-60"
              >
                {busy ? "Asking your browser…" : "Turn on for this device"}
              </button>
            )}
          </div>

          <p className="text-xs text-ink-500">
            Reminders are sent by a daily job, so the instance needs a scheduled call to{" "}
            <code className="text-ink-400">/api/notifications/run</code>.
          </p>
        </div>
      )}
    </SettingsCard>
  );
}

/**
 * A VAPID public key travels as URL-safe base64, but `subscribe` wants raw
 * bytes. There is no browser API that does this conversion.
 */
function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const raw = atob(padded);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}
