"use client";

import { useEffect, useState } from "react";
import { useSettingFact } from "./settings/facts";
import { switchKnobClass, switchTrackClass } from "./ui";

/**
 * Push for this device, on or off. A subscription belongs to the browser, not
 * the account, so the phone can be on while the laptop is not; the switch
 * asks this browser what it has and says so. The public key comes from the
 * server at request time, so one build serves any instance's keys.
 */

type State = "loading" | "on" | "off" | "denied" | "unsupported" | "install" | "busy";

function keyBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Short and human, so someone with three devices can tell them apart. */
function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? "iPhone or iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "This device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return browser ? `${os}, ${browser}` : os;
}

async function registration() {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);
  useSettingFact("push", state === "on" ? "on" : state === "off" || state === "denied" ? "off" : undefined);

  useEffect(() => {
    let live = true;
    (async (): Promise<State> => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // iOS only offers push to an app added to the home screen.
        const ios = /iPhone|iPad/.test(navigator.userAgent);
        return ios ? "install" : "unsupported";
      }
      if (Notification.permission === "denied") return "denied";
      const sub = await (await registration())?.pushManager.getSubscription();
      return sub ? "on" : "off";
    })()
      .then((s) => live && setState(s))
      .catch(() => live && setState("off"));
    return () => {
      live = false;
    };
  }, []);

  async function turnOn() {
    if (!publicKey) return;
    setState("busy");
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await registration();
      if (!reg) {
        setError("Push needs the installed app's worker, which only the production build registers.");
        setState("off");
        return;
      }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...sub.toJSON(), label: deviceLabel() }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState("on");
    } catch {
      setError("This browser would not subscribe. Try again in a moment.");
      setState("off");
    }
  }

  async function turnOff() {
    setState("busy");
    setError(null);
    try {
      const sub = await (await registration())?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setState("on");
    }
  }

  const note =
    !publicKey
      ? "Push is not set up on this Trekker: the VAPID keys are missing."
      : state === "denied"
        ? "Blocked in this browser's settings. Allow notifications for this site to turn it on."
        : state === "install"
          ? "On an iPhone, add Trekker to the home screen first; Safari only offers push to installed apps."
          : state === "unsupported"
            ? "This browser cannot take push notifications."
            : error;

  const on = state === "on";
  const usable = Boolean(publicKey) && (state === "on" || state === "off");
  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Push notifications on this device"
        disabled={!usable}
        onClick={() => void (on ? turnOff() : turnOn())}
        className={`${switchTrackClass(on)} disabled:opacity-50`}
      >
        <span className={switchKnobClass(on)} />
      </button>
      {note && <span className="max-w-[260px] text-right text-[11px] text-ink-3">{note}</span>}
    </span>
  );
}
