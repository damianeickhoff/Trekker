/**
 * The in-process work queue every outbound call from a background job goes
 * through. One process serves a household, so there is nothing to coordinate
 * with but ourselves, and three rules are enough:
 *
 * - **Concurrency.** At most `concurrency` jobs run at once, whatever asked.
 * - **Dedupe by key.** Asking for work that is already queued or running
 *   returns the promise already made. A backfill and the six-hourly pass that
 *   both want the same show fetch it once.
 * - **Rate limit per endpoint.** Each job names a gate ("tmdb", "plex",
 *   "overseerr"), and a gate lets calls start no closer together than its
 *   interval. The same gates are shared with the clients themselves, so a title
 *   page fetching one show and a job fetching a hundred draw on one budget.
 *
 * Pure and clock-injectable, so it can be tested without a server.
 */

type Clock = { now(): number; sleep(ms: number): Promise<void> };

const realClock: Clock = {
  // Monotonic, so a wall-clock change (NTP, a container resuming) cannot
  // leave a reservation days in the future and stall every call behind it.
  now: () => performance.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Minimum spacing between call starts, per named endpoint. Reservations are
 * handed out in order, so a burst of callers queues up evenly spaced rather
 * than all waking at the same instant and all going at once.
 */
export class RateGate {
  private next = new Map<string, number>();

  constructor(
    private intervals: Record<string, number>,
    private clock: Clock = realClock,
  ) {}

  async take(gate: string): Promise<void> {
    const interval = this.intervals[gate] ?? 0;
    if (interval <= 0) return;
    const now = this.clock.now();
    const slot = Math.max(now, this.next.get(gate) ?? 0);
    this.next.set(gate, slot + interval);
    if (slot > now) await this.clock.sleep(slot - now);
  }
}

type Job = {
  key: string;
  gate: string | null;
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

export class RefreshQueue {
  private pending: Job[] = [];
  private inFlight = new Map<string, Promise<unknown>>();
  private running = 0;
  private idleWaiters: (() => void)[] = [];

  constructor(
    private options: { concurrency: number; gate: RateGate },
  ) {}

  /**
   * Queues `task` under `key`, or returns the promise for the same key if it
   * is already queued or running. The result is whatever the first caller's
   * task returns; a later caller's task is dropped, which is the point.
   */
  enqueue<T>(key: string, task: () => Promise<T>, gate: string | null = null): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = new Promise<T>((resolve, reject) => {
      this.pending.push({ key, gate, run: task, resolve: resolve as (v: unknown) => void, reject });
    });
    this.inFlight.set(key, promise);
    this.pump();
    return promise;
  }

  /** Queued plus running. */
  get size() {
    return this.pending.length + this.running;
  }

  has(key: string) {
    return this.inFlight.has(key);
  }

  /** Resolves once nothing is queued or running. For tests and the cron route. */
  idle(): Promise<void> {
    if (this.size === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private pump() {
    while (this.running < this.options.concurrency && this.pending.length > 0) {
      const job = this.pending.shift()!;
      this.running += 1;
      void this.start(job);
    }
    if (this.size === 0) {
      const waiters = this.idleWaiters.splice(0);
      for (const wake of waiters) wake();
    }
  }

  private async start(job: Job) {
    try {
      if (job.gate) await this.options.gate.take(job.gate);
      job.resolve(await job.run());
    } catch (error) {
      job.reject(error);
    } finally {
      this.inFlight.delete(job.key);
      this.running -= 1;
      this.pump();
    }
  }
}
