"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, useTransition, type ReactNode } from "react";
import {
  importFromTrakt,
  linkPlexServer,
  linkSeerr,
  newWebhookSecret,
  plexServerChoices,
  saveTrakt,
  syncPlexNow,
  testPlexServer,
  testSeerr,
  unlinkPlexAccount,
  unlinkPlexServer,
  unlinkSeerr,
  unlinkTrakt,
  webhookSecretFor,
  type ServerChoice,
} from "@/lib/connection-actions";
import { Dialog, DialogTitle } from "../lists/dialog";
import { Presence } from "../presence";
import { Icon, type IconName } from "../icon";
import { buttonClass, Field } from "../ui";
import { Fold } from "./facts";

/*
 * Settings' Connections: a tile per service with its state (amber when
 * connected) and Manage or Link, which opens that service's sheet, and on a
 * desktop the Plex panel under them. The sheets act at once and say what
 * happened under the button pressed; the page behind re-renders from the new
 * rows.
 */

const SheetClose = createContext<() => void>(() => undefined);

/**
 * One service: on a phone a folded card whose header is the status line and
 * whose fold holds the state and Manage or Link; from `lg` a tile in a row of
 * three, its icon, name (an amber dot when connected), status and the same
 * button, primary while there is nothing linked. Either way the button opens
 * that service's sheet, and the tile is mounted once for both widths.
 */
export function ConnectionTile({
  name,
  icon,
  status,
  connected,
  children,
  startOpen = false,
  open = false,
  className = "",
}: {
  name: string;
  icon: IconName;
  status: string;
  connected: boolean;
  /** The sheet. */
  children: ReactNode;
  /** The sheet open on arrival: coming back from Plex's sign-in with something to say. */
  startOpen?: boolean;
  /** The card open on arrival, on a phone: the address named this section. */
  open?: boolean;
  className?: string;
}) {
  const [sheet, setSheet] = useState(startOpen);
  return (
    <Fold icon={icon} title={name} text={status} open={open} desk="tile" className={className} bodyClassName="lg:border-0">
      <div className="flex items-center gap-3 py-3 lg:flex-col lg:items-start lg:gap-2 lg:py-0">
        <span className="hidden size-[34px] items-center justify-center rounded-[10px] bg-surface-2 text-ink-2 lg:inline-flex">
          <Icon name={icon} size={17} />
        </span>
        <span className="hidden items-center gap-2 text-sm font-semibold lg:flex">
          {name}
          {connected && <span aria-label="Connected" className="size-2 rounded-full bg-accent" />}
        </span>
        <span className="hidden min-h-8 text-xs leading-4 text-ink-3 lg:line-clamp-2">{status}</span>
        <span className={`inline-flex grow items-center gap-2 text-xs font-semibold lg:hidden ${connected ? "text-accent-text" : "text-ink-3"}`}>
          <span aria-hidden="true" className={`size-2 rounded-full ${connected ? "bg-accent" : "bg-ink-3"}`} />
          {connected ? "Connected" : "Not linked"}
        </span>
        <button
          type="button"
          onClick={() => setSheet(true)}
          className={buttonClass(connected ? "ghost" : "primary", "sm", "h-9! px-4! lg:mt-1")}
        >
          {connected ? "Manage" : "Link"}
        </button>
      </div>
      <Presence open={sheet}>
        <Dialog label={name} onClose={() => setSheet(false)} wide>
          <SheetClose.Provider value={() => setSheet(false)}>
            <DialogTitle>{name}</DialogTitle>
            {children}
            <CloseButton />
          </SheetClose.Provider>
        </Dialog>
      </Presence>
    </Fold>
  );
}

function CloseButton() {
  const close = useContext(SheetClose);
  return (
    <button type="button" onClick={close} className={buttonClass("primary", "md", "self-end")}>
      Done
    </button>
  );
}

// ---------------------------------------------------------------------------
// Pieces

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 border-t border-line pt-3.5">
      <h3 className="mono-label m-0">{title}</h3>
      {children}
    </section>
  );
}

function Line({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[13px] leading-normal text-ink-2">{children}</p>;
}

/** What the last press did, under it. Amber only for a live figure, so this stays ink. */
function Said({ text }: { text: string | null }) {
  return text ? (
    <p role="status" className="m-0 text-xs font-semibold text-ink">
      {text}
    </p>
  ) : null;
}

type Result = { ok: true } | { ok: false; error: string };

/** One press at a time per sheet part, with its answer kept to show. */
function useAct() {
  const [pending, start] = useTransition();
  const [said, setSaid] = useState<string | null>(null);
  const run = <T extends Result>(act: () => Promise<T>, done: (r: T & { ok: true }) => string | null) =>
    start(async () => {
      const r = await act().catch((): Result => ({ ok: false, error: "That did not work. Try again in a moment." }));
      setSaid(r.ok ? done(r as T & { ok: true }) : r.error);
    });
  return { pending, said, setSaid, run };
}

const small = buttonClass("ghost", "sm", "h-9! px-4!");

/** A value to paste somewhere else, with a Copy beside it. */
function Copyable({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="mono-label">{label}</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 grow truncate rounded-xl border border-line bg-surface px-3 py-2 font-mono text-xs text-ink-2">{value}</code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // Refused on an insecure origin; the value is on screen to copy by hand.
            }
          }}
          className={small}
        >
          {copied ? <Icon name="check" size={16} /> : null}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/**
 * The webhook's address and secret, asked for when shown (the secret is made
 * then, the first time), with New secret for when one has leaked. `render`
 * lays them out for the service, which each wants in its own place.
 */
function Webhook({ kind, render }: { kind: "plex" | "seerr"; render: (origin: string, secret: string) => ReactNode }) {
  const [secret, setSecret] = useState<string | null>(null);
  const { pending, said, run } = useAct();
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    // The address as this page is served, so it is right behind a proxy or on a LAN address alike.
    const frame = requestAnimationFrame(() => setOrigin(window.location.origin));
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!secret) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => webhookSecretFor(kind), (r) => (setSecret((r as { secret: string }).secret), null))}
          className={`${small} self-start`}
        >
          Show the webhook
        </button>
        <Said text={said} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      {render(origin, secret)}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          run(
            () => newWebhookSecret(kind),
            (r) => (setSecret((r as { secret: string }).secret), "A new secret. Paste the new value where the old one was."),
          )
        }
        className={`${small} self-start`}
      >
        New secret
      </button>
      <Said text={said} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plex

export function PlexSheet({
  admin,
  plexName,
  canUnlink,
  server,
  syncedAt,
  message,
}: {
  admin: boolean;
  /** Who this account is on Plex, when it is linked. */
  plexName: string | null;
  /** Whether there is a password to fall back on, so Plex can be taken off. */
  canUnlink: boolean;
  server: string | null;
  syncedAt: string | null;
  /** From the return leg of a link: "linked", or what went wrong. */
  message: string | null;
}) {
  const account = useAct();
  return (
    <>
      <Part title="Your Plex account">
        {message && <Said text={message === "linked" ? "Linked. Plays you finish on Plex now log themselves." : message} />}
        {plexName ? (
          <>
            <Line>
              Signed in as <span className="font-semibold text-ink">{plexName}</span>. What you finish on Plex is read
              in every half hour{server ? "" : " once the server is linked"}, and at once through the webhook.
              {syncedAt ? ` Last read ${new Date(syncedAt).toLocaleString()}.` : ""}
            </Line>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={account.pending || !server}
                onClick={() =>
                  account.run(syncPlexNow, (r) => {
                    const s = r as unknown as { logged: number; already: number; unmatched: string[] };
                    const missed = s.unmatched.length ? ` Not matched: ${s.unmatched.join(", ")}.` : "";
                    return `${s.logged} new ${s.logged === 1 ? "play" : "plays"}, ${s.already} already here.${missed}`;
                  })
                }
                className={small}
              >
                {account.pending ? "Reading Plex" : "Sync now"}
              </button>
              {canUnlink && (
                <button type="button" disabled={account.pending} onClick={() => account.run(unlinkPlexAccount, () => "Plex is off this account.")} className={small}>
                  Unlink
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <Line>Sign in with Plex and plays log themselves the moment they happen. Your password keeps working.</Line>
            {/* A full navigation: it leaves for plex.tv and comes back here. */}
            <a href="/api/plex/pin" className={buttonClass("amber", "sm", "self-start")}>
              <Icon name="play" size={18} />
              Sign in with Plex
            </a>
          </>
        )}
        <Said text={account.said} />
      </Part>
      {admin ? <ServerPart server={server} /> : <Part title="Server">{server ? <Line>Linked by the admin: {server}.</Line> : <Line>The admin has not linked a Plex server yet.</Line>}</Part>}
      {admin && server && (
        <Part title="Instant logging">
          <Line>
            With a Plex Pass, Plex tells Trekker the moment something is watched. In Plex: Settings, Webhooks, Add
            Webhook, and paste this address.
          </Line>
          <Webhook kind="plex" render={(origin, secret) => <Copyable label="Webhook address" value={`${origin}/api/webhooks/plex?key=${secret}`} />} />
        </Part>
      )}
    </>
  );
}

function ServerPart({ server }: { server: string | null }) {
  const router = useRouter();
  const act = useAct();
  const [choices, setChoices] = useState<ServerChoice[] | null>(null);
  const [picked, setPicked] = useState<{ machineId: string; uri: string } | null>(null);

  const load = () =>
    act.run(plexServerChoices, (r) => {
      const servers = (r as unknown as { servers: ServerChoice[] }).servers;
      setChoices(servers);
      const first = servers[0];
      if (first?.connections[0]) setPicked({ machineId: first.machineId, uri: first.connections[0].uri });
      return servers.length ? null : "Your Plex account reaches no servers.";
    });

  return (
    <Part title="Server">
      {server && !choices ? (
        <>
          <Line>
            Linked at <span className="font-mono text-xs text-ink">{server}</span>. Posters get the Plex mark, title pages
            Play on Plex, and Home shows who is watching.
          </Line>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={act.pending} onClick={() => act.run(testPlexServer, (r) => `${(r as unknown as { name: string }).name} answered.`)} className={small}>
              Test
            </button>
            <button type="button" disabled={act.pending} onClick={load} className={small}>
              Change
            </button>
            <button
              type="button"
              disabled={act.pending}
              onClick={() => act.run(unlinkPlexServer, () => (router.refresh(), "Unlinked. Nothing is asked of Plex now."))}
              className={small}
            >
              Unlink
            </button>
          </div>
        </>
      ) : !choices ? (
        <>
          <Line>Choose the server this Trekker reads: its library for the marks, its sessions for who is watching.</Line>
          <button type="button" disabled={act.pending} onClick={load} className={`${buttonClass("amber", "sm")} self-start`}>
            {act.pending ? "Asking Plex" : "Choose a server"}
          </button>
        </>
      ) : (
        <>
          {choices.map((s) => (
            <fieldset key={s.machineId} className="m-0 flex flex-col gap-1.5 border-0 p-0">
              <legend className="pb-1 text-sm font-semibold">
                {s.name}
                {!s.owned && <span className="ml-2 text-xs font-normal text-ink-3">shared with you</span>}
              </legend>
              {s.connections.map((c) => {
                const on = picked?.machineId === s.machineId && picked.uri === c.uri;
                return (
                  <label key={c.uri} className="flex cursor-pointer items-center gap-2.5 text-[13px]">
                    <input
                      type="radio"
                      name="plex-address"
                      checked={on}
                      onChange={() => setPicked({ machineId: s.machineId, uri: c.uri })}
                      className="accent-(--accent)"
                    />
                    <span className="min-w-0 truncate font-mono text-xs">{c.uri}</span>
                    <span className="shrink-0 text-xs text-ink-3">{c.relay ? "relay" : c.local ? "local" : "remote"}</span>
                  </label>
                );
              })}
            </fieldset>
          ))}
          <Line>A local address is the quickest from this server; the relay only if nothing else answers.</Line>
          <button
            type="button"
            disabled={act.pending || !picked}
            onClick={() =>
              picked &&
              act.run(
                () => linkPlexServer(picked.machineId, picked.uri),
                (r) => (setChoices(null), `Linked to ${(r as unknown as { name: string }).name}. The marks are being checked now.`),
              )
            }
            className={`${buttonClass("amber", "sm")} self-start`}
          >
            {act.pending ? "Checking" : "Link this server"}
          </button>
        </>
      )}
      <Said text={act.said} />
    </Part>
  );
}

// ---------------------------------------------------------------------------
// Overseerr

export function SeerrSheet({ admin, host }: { admin: boolean; host: string | null }) {
  const act = useAct();
  const [changing, setChanging] = useState(!host);
  if (!admin) {
    return (
      <Part title="Overseerr">
        <Line>{host ? `Linked by the admin: ${host}. Request on a title page asks it to fetch the title, as you.` : "The admin has not linked Overseerr yet."}</Line>
      </Part>
    );
  }
  return (
    <>
      <Part title="Instance">
        {host && !changing ? (
          <>
            <Line>
              Linked at <span className="font-mono text-xs text-ink">{host}</span>. Requests go in as whoever asks, where
              Overseerr knows their Plex account.
            </Line>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={act.pending} onClick={() => act.run(testSeerr, (r) => `Overseerr ${(r as unknown as { version: string }).version} answered.`)} className={small}>
                Test
              </button>
              <button type="button" onClick={() => setChanging(true)} className={small}>
                Change
              </button>
              <button type="button" disabled={act.pending} onClick={() => act.run(unlinkSeerr, () => (setChanging(true), "Unlinked. Request is off everywhere."))} className={small}>
                Unlink
              </button>
            </div>
          </>
        ) : (
          <form
            className="flex flex-col gap-3"
            action={(form) =>
              act.run(
                () => linkSeerr(String(form.get("url") ?? ""), String(form.get("key") ?? "")),
                (r) => (setChanging(false), `Linked: Overseerr ${(r as unknown as { version: string }).version}.`),
              )
            }
          >
            <Field label="Address" name="url" placeholder="http://192.168.1.10:5055" defaultValue={host ?? ""} autoCapitalize="none" spellCheck={false} required />
            <Field label="API key" name="key" type="password" autoComplete="off" placeholder="Overseerr → Settings → General" required />
            <button type="submit" disabled={act.pending} className={`${buttonClass("amber", "sm")} self-start`}>
              {act.pending ? "Checking" : "Link"}
            </button>
          </form>
        )}
        <Said text={act.said} />
      </Part>
      {host && (
        <Part title="Instant updates">
          <Line>
            So a request&rsquo;s clock and a title&rsquo;s arrival show at once: in Overseerr, Settings, Notifications,
            Webhook. Turn it on, paste the address and the authorisation header, and tick Request Pending Approval,
            Request Approved, Request Automatically Approved, Request Declined and Media Available.
          </Line>
          <Webhook
            kind="seerr"
            render={(origin, secret) => (
              <>
                <Copyable label="Webhook URL" value={`${origin}/api/webhooks/overseerr`} />
                <Copyable label="Authorization header" value={secret} />
              </>
            )}
          />
        </Part>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Trakt

export type ImportView = {
  running: boolean;
  stage: string | null;
  total: number;
  done: number;
  finishedAt: string | null;
  summary: { films?: number; episodes?: number; ratings?: number; saved?: number; already?: number; skipped?: number; error?: string } | null;
};

function lastImport(view: ImportView) {
  if (view.running) return `Importing: ${view.stage ?? "starting"}${view.total ? `, ${view.done} of ${view.total}` : ""}. Home shows how far it has got.`;
  const s = view.summary;
  if (!s || !view.finishedAt) return null;
  if (s.error) return `The last import stopped: ${s.error}`;
  return `Last import: ${s.films ?? 0} films, ${s.episodes ?? 0} episodes, ${s.ratings ?? 0} ratings and ${s.saved ?? 0} for the watchlist; ${s.already ?? 0} already here.`;
}

export function TraktSheet({
  username,
  instanceClientId,
  importing,
}: {
  username: string | null;
  /** Whether `TRAKT_CLIENT_ID` is set, so a username alone will do. */
  instanceClientId: boolean;
  importing: ImportView;
}) {
  const router = useRouter();
  const act = useAct();
  const upload = useAct();
  const [file, setFile] = useState<File | null>(null);

  return (
    <>
      <Part title="Your Trakt profile">
        {username ? (
          <>
            <Line>
              Linked to <span className="font-semibold text-ink">{username}</span>. Import brings your watched history
              with its dates, your ratings as popcorn and your watchlist. Nothing already here is doubled, and nothing
              is ever sent back to Trakt.
            </Line>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={act.pending || importing.running}
                onClick={() => act.run(importFromTrakt, () => (router.refresh(), "Importing. Home shows how far it has got."))}
                className={buttonClass("amber", "sm")}
              >
                Import now
              </button>
              <button type="button" disabled={act.pending} onClick={() => act.run(unlinkTrakt, () => "Unlinked. What was imported stays.")} className={small}>
                Unlink
              </button>
            </div>
          </>
        ) : (
          <form
            className="flex flex-col gap-3"
            action={(form) => act.run(() => saveTrakt(String(form.get("username") ?? ""), String(form.get("client") ?? "")), () => "Linked. Import when you are ready.")}
          >
            <Line>
              The profile has to be public: Trakt&rsquo;s public pages need only an API client id, not a sign-in.
              {instanceClientId ? " This Trakt has a client id of its own, so the username will do." : ""}
            </Line>
            <Field label="Trakt username" name="username" autoCapitalize="none" spellCheck={false} required />
            <Field label={instanceClientId ? "API client id (optional)" : "API client id"} name="client" autoComplete="off" required={!instanceClientId} />
            <button type="submit" disabled={act.pending} className={`${buttonClass("amber", "sm")} self-start`}>
              {act.pending ? "Checking" : "Link"}
            </button>
          </form>
        )}
        <Said text={act.said} />
      </Part>
      <Part title="Or from an export">
        <Line>Any Trakt account can ask for a data export in Trakt&rsquo;s settings. Upload the zip they email, as it arrives.</Line>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`${small} cursor-pointer`}>
            {file ? file.name.slice(0, 28) : "Choose file"}
            <input type="file" accept=".zip,.json,application/zip,application/json" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <button
            type="button"
            disabled={!file || upload.pending || importing.running}
            onClick={() =>
              file &&
              upload.run(
                async () => {
                  const body = new FormData();
                  body.set("file", file);
                  const res = await fetch("/api/import/trakt", { method: "POST", body });
                  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
                  return data.ok ? { ok: true as const } : { ok: false as const, error: data.error ?? "That upload did not work." };
                },
                () => (router.refresh(), "Importing. Home shows how far it has got."),
              )
            }
            className={buttonClass("amber", "sm")}
          >
            {upload.pending ? "Reading" : "Import file"}
          </button>
        </div>
        <Said text={upload.said} />
      </Part>
      {lastImport(importing) && (
        <Part title="Import">
          <Line>{lastImport(importing)}</Line>
        </Part>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// The desktop's Plex panel

function PanelRow({ label, sub, children }: { label: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center gap-3 border-b border-line py-2.5 last:border-b-0">
      <span className="flex min-w-0 grow flex-col gap-0.5">
        <span className="text-sm font-semibold">{label}</span>
        {sub && <span className="text-xs text-ink-3">{sub}</span>}
      </span>
      {children}
    </div>
  );
}

/**
 * The webhook's address, asked for once the panel is on a desktop screen
 * (the secret is made the first time it is asked for, so a phone that never
 * shows the panel never asks).
 */
function WebhookLine() {
  const [address, setAddress] = useState<string | null>(null);
  const { said, run } = useAct();
  useEffect(() => {
    if (!matchMedia("(min-width: 64rem)").matches) return;
    run(
      () => webhookSecretFor("plex"),
      (r) => (setAddress(`${window.location.origin}/api/webhooks/plex?key=${(r as { secret: string }).secret}`), null),
    );
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return address ? (
    <Copyable label="Webhook address" value={address} />
  ) : (
    <span className="text-xs text-ink-3">{said ?? "Fetching the address"}</span>
  );
}

/**
 * Plex, row by row, under the tiles on a desktop: the server, the webhook
 * (the admin's), the watch history with Sync now, and who is signed in with
 * Unlink. The same actions as the Plex sheet, laid out flat because the
 * desktop has the room; the server's own settings stay in the sheet.
 */
export function PlexPanel({
  admin,
  plexName,
  canUnlink,
  server,
  syncedAt,
}: {
  admin: boolean;
  plexName: string | null;
  canUnlink: boolean;
  server: string | null;
  syncedAt: string | null;
}) {
  const sync = useAct();
  const account = useAct();
  return (
    <section aria-labelledby="plex-panel" className="flex flex-col rounded-[18px] bg-surface px-5 py-2 shadow-elevation">
      <h3 id="plex-panel" className="mono-label m-0 pb-1 pt-3">
        Plex
      </h3>
      <PanelRow
        label="Server"
        sub={server ? <span className="font-mono">{server}</span> : admin ? "Choose one under Manage" : "The admin has not linked a Plex server yet"}
      >
        <span className={`inline-flex shrink-0 items-center gap-2 text-xs font-semibold ${server ? "text-accent-text" : "text-ink-3"}`}>
          <span aria-hidden="true" className={`size-2 rounded-full ${server ? "bg-accent" : "bg-ink-3"}`} />
          {server ? "Connected" : "Not linked"}
        </span>
      </PanelRow>
      {admin && server && (
        <div className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0">
          <span className="text-sm font-semibold">Webhook</span>
          <WebhookLine />
          <span className="text-xs text-ink-3">Paste this in Plex › Settings › Webhooks so plays arrive as they happen.</span>
        </div>
      )}
      {plexName && (
        <PanelRow
          label="Watch history"
          sub={
            sync.said ??
            `Read every half hour, and now${syncedAt ? `. Last read ${new Date(syncedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}`
          }
        >
          <button
            type="button"
            disabled={sync.pending || !server}
            onClick={() =>
              sync.run(syncPlexNow, (r) => {
                const s = r as unknown as { logged: number; already: number; unmatched: string[] };
                const missed = s.unmatched.length ? ` Not matched: ${s.unmatched.join(", ")}.` : "";
                return `${s.logged} new ${s.logged === 1 ? "play" : "plays"}, ${s.already} already here.${missed}`;
              })
            }
            className={small}
          >
            {sync.pending ? "Reading Plex" : "Sync now"}
          </button>
        </PanelRow>
      )}
      {plexName ? (
        <PanelRow
          label={
            <>
              Signed in as <span className="text-ink">{plexName}</span>
            </>
          }
          sub={account.said ?? (canUnlink ? "Your password keeps working if you unlink" : "This account signs in with Plex")}
        >
          {canUnlink && (
            <button type="button" disabled={account.pending} onClick={() => account.run(unlinkPlexAccount, () => "Plex is off this account.")} className={small}>
              Unlink
            </button>
          )}
        </PanelRow>
      ) : (
        <PanelRow label="Your Plex account" sub="Sign in with Plex and plays log themselves the moment they happen">
          {/* A full navigation: it leaves for plex.tv and comes back here. */}
          <a href="/api/plex/pin" className={buttonClass("primary", "sm", "h-9! px-4!")}>
            Sign in with Plex
          </a>
        </PanelRow>
      )}
    </section>
  );
}
