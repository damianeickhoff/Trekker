/**
 * The screensaver's "nothing has happened for N minutes", with no polling.
 *
 * Input only writes down when it happened; it never touches a timer, since
 * `pointermove` fires a hundred times a second and rescheduling on each one is
 * work nobody needs. One timeout is armed for the full delay, and when it
 * fires it looks at the last input: long enough ago, and it is idle; not, and
 * it re-arms for exactly the time still to wait. So a timer fires at most once
 * per delay however busy the page is, and never at all while it is in use.
 *
 * `shouldFire` lets the caller veto the moment (a hidden tab, a video in full
 * screen); a veto counts as input, so the wait starts over.
 */

export type Clock = {
  now: () => number;
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

const realClock: Clock = {
  now: () => Date.now(),
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type IdleTimer = {
  /** Something happened: the wait starts again from now. */
  activity: () => void;
  /** No more firing, ever; for unmounting. */
  stop: () => void;
};

export function createIdleTimer(
  delayMs: number,
  onIdle: () => void,
  { shouldFire = () => true, clock = realClock }: { shouldFire?: () => boolean; clock?: Clock } = {},
): IdleTimer {
  let last = clock.now();
  let stopped = false;
  let handle: unknown = null;

  const arm = (ms: number) => {
    handle = clock.set(check, Math.max(ms, 0));
  };

  function check() {
    if (stopped) return;
    const waited = clock.now() - last;
    if (waited < delayMs) return arm(delayMs - waited);
    if (!shouldFire()) {
      last = clock.now();
      return arm(delayMs);
    }
    stopped = true;
    onIdle();
  }

  arm(delayMs);
  return {
    activity: () => {
      last = clock.now();
    },
    stop: () => {
      stopped = true;
      if (handle !== null) clock.clear(handle);
    },
  };
}
