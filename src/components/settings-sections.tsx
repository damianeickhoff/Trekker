"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Cast,
  CheckCircle2,
  ChevronDown,
  Download,
  DownloadCloud,
  MonitorPlay,
  Palette,
  Play,
  Server,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { importPlexWatchlist, type PlexSyncState } from "@/lib/plex-import-actions";
import { importPlexHistory, type PlexHistoryState } from "@/lib/plex-history-actions";
import {
  disconnectPlex,
  savePlexSettings,
  savePlexUsername,
  type PlexFormState,
} from "@/lib/plex-actions";
import { saveScreensaver } from "@/lib/screensaver-actions";
import {
  IDLE_CHOICES,
  SCREENSAVER_SOURCES,
  describeIdle,
  sourceLabel,
} from "@/lib/screensaver-options";
import {
  disconnectSeerr,
  disconnectTrakt,
  removeAvatar,
  saveSeerrSettings,
  saveTraktSettings,
  updateProfile,
  uploadAvatar,
  type SettingsState,
} from "@/lib/settings-actions";
import { ACCENTS } from "@/lib/accents";
import { AvatarCropper } from "./avatar-cropper";
import { PlexWebhookHint } from "./plex-webhook-hint";
import { AccentPicker, ThemeSwitcher, type Theme } from "./theme";
import { ImportProgress, ImportSummary, useTraktImport } from "./trakt-import";
import { BusyBar } from "./ui";

/**
 * A run of settings under one heading.
 *
 * The page was a single column of thirty-odd controls with nothing between them
 * but a gap, so "where do I change my accent" and "where do I point this at my
 * Plex" were the same length of scroll. Three headings — you, the things it
 * talks to, the instance — turn that into a place you can aim at.
 */
export function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7">
      <h2 className="mb-2 px-1 text-[11px] font-medium tracking-wider text-ink-400 uppercase">
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

/**
 * One setting, folded away with what it currently holds written on the outside.
 *
 * The same shape as a smart list's filters, and for the same reason. Laid out
 * flat this page is nine panels and about forty controls, which is a wall you
 * scroll rather than a page you read; folded, it is nine lines that each answer
 * the question you came to ask — "am I linked to Plex", "which theme is on" —
 * and you open only the one you came to change. The summary is what makes that
 * work. A closed section that did not say "Linked as damian" would just be
 * hiding things.
 *
 * `<details>` rather than a `useState` accordion, again as the filters do: the
 * keyboard behaviour, the focus handling and the expanded/collapsed
 * announcement all arrive correct, and there is no state here worth owning.
 */
export function SettingsCard({
  title,
  description,
  icon,
  summary,
  active = false,
  defaultOpen = false,
  children,
  aside,
}: {
  title: string;
  description: string;
  /** A bare lucide glyph. The tint comes from `active`, not from the caller. */
  icon?: React.ReactNode;
  /** What this setting currently holds, read on the closed header. */
  summary?: React.ReactNode;
  /** On, linked, connected — whatever "set up" means for this one. */
  active?: boolean;
  defaultOpen?: boolean;
  children?: React.ReactNode;
  /** A control that belongs beside the description rather than below it. */
  aside?: React.ReactNode;
}) {
  return (
    <details
      className={`card group overflow-hidden transition ${active ? "border-flare-500/35" : ""}`}
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 transition hover:bg-ink-800/40 [&::-webkit-details-marker]:hidden">
        {icon && (
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition ${
              active
                ? "border-flare-500/45 bg-flare-600/20 text-flare-300"
                : "border-ink-700 bg-ink-800/50 text-ink-400"
            }`}
          >
            {icon}
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold tracking-tight">{title}</span>
          <span className="mt-0.5 block truncate text-xs text-ink-400">
            {summary ?? description}
          </span>
        </span>

        <ChevronDown
          size={16}
          className="shrink-0 text-ink-500 transition group-open:rotate-180"
        />
      </summary>

      <div className="border-t border-ink-800 px-4 py-4">
        {/* The description moves inside the fold: on the closed header its job
            is done by the summary, which says something about *your* setup
            rather than about the feature. */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-prose text-xs text-ink-400">{description}</p>
          {aside}
        </div>
        {children}
      </div>
    </details>
  );
}

function Field({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium tracking-wide text-ink-300 uppercase">
        {label}
      </span>
      <input
        {...props}
        className="w-full rounded-xl border border-ink-700 bg-ink-900/70 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-ink-600 focus:border-flare-500 focus:ring-2 focus:ring-flare-600/30"
      />
      {hint && <span className="mt-1.5 block text-xs text-ink-500">{hint}</span>}
    </label>
  );
}

function Feedback({ state }: { state: SettingsState | PlexFormState }) {
  if (state.error) {
    return (
      <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p className="rounded-lg border border-fresh-500/30 bg-fresh-500/10 px-3 py-2 text-sm text-fresh-500">
        {state.ok}
      </p>
    );
  }
  return null;
}

export function ProfileSection({
  name,
  email,
  avatarUrl,
  managed = false,
}: {
  name: string;
  email: string;
  avatarUrl: string | null;
  /**
   * A managed Plex Home profile. They have no address of their own — what is on
   * the row is a placeholder minted to satisfy a unique index — so the field is
   * offered as something they may fill in rather than shown as a fact about
   * them, and the header does not repeat it.
   */
  managed?: boolean;
}) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    updateProfile,
    {},
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [avatarState, setAvatarState] = useState<SettingsState>({});
  const [uploading, setUploading] = useState(false);

  async function upload(cropped: File) {
    setPicked(null);
    setUploading(true);

    const data = new FormData();
    data.set("avatar", cropped);
    setAvatarState(await uploadAvatar({}, data));
    setUploading(false);
  }

  return (
    <SettingsCard
      title="Profile"
      description={
        managed
          ? "Your name and picture. This profile signs in through your Plex Home, so it has no password and needs no address."
          : "Your name, email and picture."
      }
      icon={<UserRound size={16} />}
      summary={managed ? `${name} · Plex Home profile` : `${name} · ${email}`}
      active
    >
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <span className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-flare-600 to-ember-500 text-2xl font-black text-white">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt=""
              width={80}
              height={80}
              className="h-20 w-20 object-cover"
              unoptimized
            />
          ) : (
            name.slice(0, 1).toUpperCase()
          )}
        </span>

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setPicked(file);
            // Allow picking the same file again after cancelling.
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-xl border border-ink-700 px-3.5 py-2 text-sm text-ink-100 transition hover:bg-ink-800 disabled:opacity-60"
        >
          <Upload size={15} />
          {uploading ? "Uploading…" : avatarUrl ? "Change picture" : "Upload picture"}
        </button>

        {avatarUrl && (
          <form action={removeAvatar}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl border border-ink-700 px-3.5 py-2 text-sm text-ink-400 transition hover:border-red-500/50 hover:text-red-300"
            >
              <Trash2 size={15} />
              Remove
            </button>
          </form>
        )}
      </div>

      <div className="mt-2">
        <Feedback state={avatarState} />
      </div>

      {picked && (
        <AvatarCropper file={picked} onCancel={() => setPicked(null)} onDone={upload} />
      )}

      <form action={formAction} className="mt-5 space-y-3">
        <Field label="Name" name="name" defaultValue={name} required />
        <Field
          label="Email"
          name="email"
          type="email"
          // Blank rather than the stand-in address: a field showing something
          // nobody chose invites them to keep it. Filling this in is how a Plex
          // Home profile becomes reachable by email — for a password later, or
          // for a friend request now.
          defaultValue={managed ? "" : email}
          placeholder={managed ? "Add one if you want to" : undefined}
          required={!managed}
          hint={managed ? "Optional. Nothing is ever sent to it." : undefined}
        />
        <Feedback state={state} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-flare-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-flare-500 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </form>
    </SettingsCard>
  );
}

/**
 * Trakt is a personal account, so this whole section is per user.
 *
 * Two ways in. The export file is the one to reach for: Trakt's API needs a VIP
 * subscription for a client id, but any account can request a data export. The
 * API route stays for people who do have VIP and would rather not re-upload.
 */
export function TraktSection({
  username,
  hasOwnClientId,
  hasFallbackClientId,
}: {
  username: string | null;
  hasOwnClientId: boolean;
  hasFallbackClientId: boolean;
}) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    saveTraktSettings,
    {},
  );

  /**
   * One import at a time, whichever way it was started — the server refuses a
   * second run anyway, and two panels each claiming to be the one in progress
   * would be the page disagreeing with itself.
   */
  const trakt = useTraktImport();

  const connected = Boolean(username);

  return (
    <SettingsCard
      title="Trakt"
      description="Bring your watch history across. Upload an export, or connect the API if you have VIP."
      icon={<DownloadCloud size={16} />}
      active={connected || trakt.running}
      summary={
        trakt.running
          ? "Importing right now"
          : connected
            ? `API connected as ${username}`
            : "Ready for an export file"
      }
      // Open on its own when there is a run to watch, so an import in progress
      // is not hidden behind a fold the reader has to know to look inside.
      defaultOpen={trakt.running}
      aside={
        connected ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-fresh-500">
              <CheckCircle2 size={14} /> Connected
            </span>
            <form action={disconnectTrakt}>
              <button
                type="submit"
                className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs text-ink-400 transition hover:border-red-500/50 hover:text-red-300"
              >
                Disconnect
              </button>
            </form>
          </div>
        ) : null
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void trakt.start(new FormData(event.currentTarget));
        }}
        className="mt-4 space-y-3"
      >
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium tracking-wide text-ink-300 uppercase">
            Trakt export file
          </span>
          <input
            type="file"
            name="export"
            accept=".zip,.json,application/zip,application/json"
            className="w-full rounded-xl border border-ink-700 bg-ink-900/70 px-3.5 py-2.5 text-sm text-ink-300 outline-none transition file:mr-3 file:rounded-lg file:border-0 file:bg-ink-800 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink-100 focus:border-flare-500"
          />
          <span className="mt-1.5 block text-xs text-ink-500">
            In Trakt: <span className="text-ink-300">Settings → Your data → Request export</span>
            . They email you a zip — upload it here as it comes, no unpacking needed.
          </span>
        </label>

        <ImportSummary summary={trakt.summary} error={trakt.error} />

        {trakt.running ? (
          <ImportProgress job={trakt.job} starting={trakt.starting} />
        ) : (
          <button
            type="submit"
            className="rounded-xl bg-flare-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-flare-500"
          >
            Import from file
          </button>
        )}

        <p className="text-xs text-ink-500">
          Anything already logged is left alone, so running this twice is safe. The import keeps
          going on the server if you close this page — come back and it will still be here.
        </p>
      </form>

      <details className="group mt-5 border-t border-ink-800 pt-4">
        <summary className="cursor-pointer list-none text-sm font-medium text-ink-300 transition hover:text-ink-100">
          <span className="group-open:hidden">Connect the Trakt API instead</span>
          <span className="hidden group-open:inline">Trakt API</span>
          <span className="ml-1.5 text-xs font-normal text-ink-500">· needs Trakt VIP</span>
        </summary>

        <p className="mt-2 text-xs text-ink-500">
          Imports without uploading anything, but a client id requires a VIP subscription. Your
          Trakt profile also has to be public.
        </p>

        <form action={formAction} className="mt-4 space-y-3">
        <Field
          label="Trakt username"
          name="traktUsername"
          defaultValue={username ?? ""}
          placeholder="your-trakt-username"
          hint="Found in your Trakt profile URL: trakt.tv/users/your-trakt-username"
        />
        <Field
          label="Client id"
          name="traktClientId"
          type="password"
          autoComplete="off"
          placeholder={
            hasOwnClientId || hasFallbackClientId ? "••••••••••••••••••••" : "your client id"
          }
          hint={
            hasOwnClientId ? (
              "Saved — leave blank to keep it."
            ) : hasFallbackClientId ? (
              "Optional: this instance already provides one. Set your own to use it instead."
            ) : (
              <>
                Create an API app at{" "}
                <a
                  href="https://trakt.tv/oauth/applications"
                  target="_blank"
                  rel="noreferrer"
                  className="text-flare-400 underline underline-offset-2"
                >
                  trakt.tv/oauth/applications
                </a>{" "}
                and copy its client id.
              </>
            )
          }
        />
        <Feedback state={state} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl border border-ink-700 px-4 py-2.5 text-sm font-semibold text-ink-100 transition hover:bg-ink-800 disabled:opacity-60"
        >
          {pending ? "Checking with Trakt…" : "Save and test"}
        </button>
        </form>

        {connected && (
          <div className="mt-4 space-y-3 border-t border-ink-800/70 pt-4">
            {/* The same job and the same progress as the file route above: the
                two differ only in where the history is read from. */}
            <ImportSummary summary={trakt.summary} error={trakt.error} />
            {trakt.running ? (
              <ImportProgress job={trakt.job} starting={trakt.starting} />
            ) : (
              <button
                type="button"
                onClick={() => void trakt.start()}
                className="rounded-xl border border-ink-700 px-4 py-2.5 text-sm font-semibold text-ink-100 transition hover:bg-ink-800"
              >
                Import over the API
              </button>
            )}
          </div>
        )}
      </details>
    </SettingsCard>
  );
}

/**
 * The viewer's own Plex account, as opposed to the instance's server. Signing
 * in with Plex is what stores the token these features need, so an account that
 * uses a password gets pointed at that rather than a second set of fields.
 */
export function PlexAccountSection({
  username,
  linked,
  webhookConfigured,
}: {
  username: string | null;
  linked: boolean;
  webhookConfigured: boolean;
}) {
  const [state, setState] = useState<PlexSyncState>({});
  const [syncing, setSyncing] = useState(false);
  const [history, setHistory] = useState<PlexHistoryState>({});
  const [pulling, setPulling] = useState(false);
  const [nameState, nameAction] = useActionState(savePlexUsername, {});

  async function sync() {
    setSyncing(true);
    setState(await importPlexWatchlist());
    setSyncing(false);
  }

  async function pullHistory() {
    setPulling(true);
    setHistory(await importPlexHistory());
    setPulling(false);
  }

  return (
    <SettingsCard
      title="Your Plex account"
      description={
        linked
          ? `Linked as ${username ?? "your Plex account"}. Powers the "watching now" card and watchlist sync.`
          : "Link your Plex account for the “watching now” card and watchlist sync."
      }
      icon={<Cast size={16} />}
      active={linked}
      summary={
        linked
          ? `Linked as ${username ?? "your Plex account"}`
          : username
            ? `Viewing as ${username} · account not linked`
            : "Not linked"
      }
      aside={
        linked ? (
          <span className="flex items-center gap-1.5 text-xs text-fresh-500">
            <CheckCircle2 size={14} /> Linked
          </span>
        ) : null
      }
    >
      {linked ? (
        <div className="mt-4 space-y-3">
          {state.error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {state.error}
            </p>
          )}
          {state.summary && (
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
              Added {state.summary.added} title{state.summary.added === 1 ? "" : "s"}
              {state.summary.already > 0 && ` · ${state.summary.already} already here`}
              {state.summary.pushed > 0 && ` · ${state.summary.pushed} sent to Plex`}
              {state.summary.pushFailed > 0 &&
                ` · ${state.summary.pushFailed} could not be sent`}
              {state.summary.skipped > 0 && ` · ${state.summary.skipped} skipped`}.
              {state.summary.pushErrors.length > 0 && (
                <span className="mt-1 block text-xs text-emerald-400/70">
                  Why: {state.summary.pushErrors.join("; ")}.
                </span>
              )}
            </p>
          )}

          {history.error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {history.error}
            </p>
          )}
          {history.summary && (
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
              Logged {history.summary.movies} movie
              {history.summary.movies === 1 ? "" : "s"} and {history.summary.episodes} episode
              {history.summary.episodes === 1 ? "" : "s"}
              {history.summary.already > 0 && ` · ${history.summary.already} already here`}
              {history.summary.skipped > 0 && ` · ${history.summary.skipped} skipped`}.
              {history.summary.unmatched.length > 0 && (
                <span className="mt-1 block text-xs text-emerald-400/70">
                  Not matched to TMDB: {history.summary.unmatched.join(", ")}.
                </span>
              )}
            </p>
          )}

          {syncing ? (
            <BusyBar label="Reading your Plex watchlist…" />
          ) : pulling ? (
            <BusyBar label="Reading what you have watched on Plex…" />
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={sync}
                className="rounded-xl bg-flare-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-flare-500"
              >
                Sync watchlist with Plex
              </button>
              <button
                type="button"
                onClick={pullHistory}
                className="rounded-xl border border-ink-700 px-4 py-2.5 text-sm font-medium text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
              >
                Import what you have watched
              </button>
            </div>
          )}

          <p className="text-xs text-ink-500">
            Watchlists sync both ways. Finished viewing is pulled across automatically, and
            immediately if the Plex webhook is set up.
          </p>
        </div>
      ) : null}

      {/* Separate from the sign-in flow on purpose: a managed profile in a Plex
          Home has no plex.tv login to sign in with, so the username is the only
          way to say "this profile is that viewer". */}
      <form action={nameAction} className="mt-4 border-t border-ink-800 pt-4">
        <Feedback state={nameState} />
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="min-w-52 flex-1">
            <Field
              label="Plex username"
              name="plexUsername"
              defaultValue={username ?? ""}
              placeholder="e.g. kids"
              hint="Whose viewing on the server belongs to this profile. Needed for a Plex Home child profile, which cannot sign in itself."
            />
          </div>
          <button
            type="submit"
            className="rounded-xl border border-ink-700 px-4 py-2.5 text-sm font-medium text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
          >
            Save
          </button>
        </div>
      </form>

      <PlexWebhookHint configured={webhookConfigured} />

      {!linked && (
        <div className="mt-4">
          <a
            href="/api/auth/plex"
            className="inline-flex items-center gap-2 rounded-xl bg-[#e5a00d] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[#f0b024]"
          >
            <Cast size={15} />
            Link your Plex account
          </a>
          <p className="mt-2 text-xs text-ink-500">
            Signs in through plex.tv. Your password never reaches Trekker. A managed profile in a
            Plex Home cannot sign in — set the username above instead.
          </p>
        </div>
      )}
    </SettingsCard>
  );
}

const THEME_LABEL: Record<Theme, string> = {
  dark: "Dark",
  light: "Light",
  system: "Following your system",
};

export function AppearanceSection({
  theme,
  accent,
  seasonal,
}: {
  theme: Theme;
  accent: string;
  seasonal?: boolean;
}) {
  const accentLabel = ACCENTS.find((option) => option.id === accent)?.label ?? "Violet";

  return (
    <SettingsCard
      title="Appearance"
      description="Light, dark, or follow your system. Saved to your profile, so it follows you between devices."
      icon={<Palette size={16} />}
      active
      summary={
        seasonal
          ? `${THEME_LABEL[theme]} · wearing this season's colour`
          : `${THEME_LABEL[theme]} · ${accentLabel}`
      }
    >
      <div className="mt-4">
        <ThemeSwitcher current={theme} />
      </div>

      <div className="mt-6">
        <p className="mb-2 text-[11px] font-medium tracking-wider text-ink-400 uppercase">
          Accent
        </p>
        <AccentPicker current={accent} seasonal={seasonal} />
      </div>
    </SettingsCard>
  );
}

/**
 * The screensaver.
 *
 * Three questions, and the order is deliberate: when it starts, what it shows,
 * and whether it knows where you live. Only the first is really a setting — the
 * other two are what makes the thing worth looking at — so the summary line on
 * the closed card answers the first one, which is the one somebody opening this
 * page came to change.
 *
 * "Start it now" is a button rather than a link because of the fullscreen call.
 * A browser only hands over the whole screen in response to somebody pressing
 * something, so the request has to happen inside this click and not on the page
 * that follows it; navigating afterwards keeps the window it was just given.
 */
export function ScreensaverSection({
  idle,
  source,
  place,
}: {
  idle: number;
  source: string;
  place: string | null;
}) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    saveScreensaver,
    {},
  );
  const router = useRouter();

  const select =
    "w-full rounded-xl border border-ink-700 bg-ink-900/70 px-3.5 py-2.5 text-sm text-ink-100 outline-none transition focus:border-flare-500 focus:ring-2 focus:ring-flare-600/30 light:bg-white";

  async function startNow() {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Refused, or already fullscreen, or a browser that does not do it on a
      // phone. The screensaver is worth having either way.
    }
    router.push("/screensaver?from=%2Fsettings");
  }

  return (
    <SettingsCard
      title="Screensaver"
      description="A full-screen slideshow of artwork with the time, the weather and whoever in the house has something playing. Escape, or a tap on the screen, brings you straight back — a moving mouse deliberately does not."
      icon={<MonitorPlay size={16} />}
      active={idle > 0}
      summary={`${describeIdle(idle)} · ${sourceLabel(source)}`}
      aside={
        <button
          type="button"
          onClick={startNow}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-ink-700 px-3.5 py-2 text-sm text-ink-100 transition hover:bg-ink-800"
        >
          <Play size={14} />
          Start it now
        </button>
      }
    >
      <form action={formAction} className="mt-4 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium tracking-wide text-ink-300 uppercase">
            Start it on its own
          </span>
          <select name="idle" defaultValue={String(idle)} className={select}>
            {IDLE_CHOICES.map((minutes) => (
              <option key={minutes} value={String(minutes)}>
                {describeIdle(minutes)}
              </option>
            ))}
          </select>
          <span className="mt-1.5 block text-xs text-ink-500">
            Counted from the last thing you did in this tab, and never while something is
            playing full screen.
          </span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium tracking-wide text-ink-300 uppercase">
            What it shows
          </span>
          <select name="source" defaultValue={source} className={select}>
            {SCREENSAVER_SOURCES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="mt-1.5 block text-xs text-ink-500">
            {SCREENSAVER_SOURCES.find((option) => option.id === source)?.blurb ??
              SCREENSAVER_SOURCES[0].blurb}
          </span>
        </label>

        <Field
          label="Weather for"
          name="place"
          defaultValue={place ?? ""}
          placeholder="Utrecht"
          hint={
            <>
              Optional. The name is looked up once, here, and only the coordinates are
              kept — the forecast comes from{" "}
              <a
                href="https://open-meteo.com"
                target="_blank"
                rel="noreferrer"
                className="text-flare-400 underline underline-offset-2"
              >
                open-meteo.com
              </a>
              , which needs no account and is told nothing about you. Leave it empty for no
              weather at all.
            </>
          }
        />

        <Feedback state={state} />

        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-flare-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-flare-500 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </form>
    </SettingsCard>
  );
}

export function PlexSection({
  connected,
  plexUrl,
}: {
  connected: boolean;
  plexUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState<PlexFormState, FormData>(
    savePlexSettings,
    {},
  );

  return (
    <SettingsCard
      title="Plex"
      description={
        connected ? `Connected to ${plexUrl}` : "See which titles are already in your library."
      }
      icon={<Server size={16} />}
      active={connected}
      summary={connected ? plexUrl : "Not set up"}
      aside={
        connected ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-fresh-500">
              <CheckCircle2 size={14} /> Connected
            </span>
            <form action={disconnectPlex}>
              <button
                type="submit"
                className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs text-ink-400 transition hover:border-red-500/50 hover:text-red-300"
              >
                Disconnect
              </button>
            </form>
          </div>
        ) : null
      }
    >
      <form action={formAction} className="mt-4 space-y-3">
        <Field
          label="Server address"
          name="plexUrl"
          defaultValue={plexUrl ?? ""}
          placeholder="http://192.168.1.10:32400"
        />
        <Field
          label="X-Plex-Token"
          name="plexToken"
          type="password"
          autoComplete="off"
          placeholder="••••••••••••••••••••"
          hint={
            <>
              In Plex: open any item → ⋯ → Get Info → View XML, then copy the{" "}
              <code className="font-mono">X-Plex-Token</code> from the address bar.{" "}
              <a
                href="https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/"
                target="_blank"
                rel="noreferrer"
                className="text-flare-400 underline underline-offset-2"
              >
                Full instructions
              </a>
              .
            </>
          }
        />
        <Feedback state={state} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-flare-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-flare-500 disabled:opacity-60"
        >
          {pending ? "Checking the server…" : "Save and test"}
        </button>
      </form>
    </SettingsCard>
  );
}

export function SeerrSection({
  connected,
  seerrUrl,
}: {
  connected: boolean;
  seerrUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    saveSeerrSettings,
    {},
  );

  return (
    <SettingsCard
      title="Overseerr / Jellyseerr"
      description={
        connected
          ? `Connected to ${seerrUrl}`
          : "Request movies and shows you do not have yet, straight from a title page."
      }
      icon={<Download size={16} />}
      active={connected}
      summary={connected ? seerrUrl : "Not set up"}
      aside={
        connected ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-fresh-500">
              <CheckCircle2 size={14} /> Connected
            </span>
            <form action={disconnectSeerr}>
              <button
                type="submit"
                className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs text-ink-400 transition hover:border-red-500/50 hover:text-red-300"
              >
                Disconnect
              </button>
            </form>
          </div>
        ) : null
      }
    >
      <form action={formAction} className="mt-4 space-y-3">
        <Field
          label="Instance address"
          name="seerrUrl"
          defaultValue={seerrUrl ?? ""}
          placeholder="http://192.168.1.10:5055"
        />
        <Field
          label="API key"
          name="seerrApiKey"
          type="password"
          autoComplete="off"
          placeholder="••••••••••••••••••••"
          hint="Overseerr → Settings → General → API Key."
        />
        <Feedback state={state} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-flare-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-flare-500 disabled:opacity-60"
        >
          {pending ? "Checking the instance…" : "Save and test"}
        </button>
      </form>
    </SettingsCard>
  );
}
