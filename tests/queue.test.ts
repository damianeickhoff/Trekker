import { describe, expect, it } from "vitest";
import { RateGate, RefreshQueue } from "@/lib/queue";

/** A clock the test moves by hand, so rate limits are asserted exactly. */
function fakeClock() {
  let now = 0;
  const sleepers: { until: number; wake: () => void }[] = [];
  return {
    now: () => now,
    sleep: (ms: number) => new Promise<void>((wake) => sleepers.push({ until: now + ms, wake })),
    async advance(ms: number) {
      now += ms;
      for (const s of sleepers.filter((s) => s.until <= now)) {
        sleepers.splice(sleepers.indexOf(s), 1);
        s.wake();
      }
      // Let the woken jobs run up to their next await.
      for (let i = 0; i < 10; i++) await Promise.resolve();
    },
  };
}

const tick = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe("RefreshQueue", () => {
  it("runs one task for a key asked for twice, and gives both callers its result", async () => {
    const queue = new RefreshQueue({ concurrency: 4, gate: new RateGate({}) });
    let calls = 0;
    const task = async () => {
      calls += 1;
      return "details";
    };

    const [a, b] = await Promise.all([queue.enqueue("show:1", task), queue.enqueue("show:1", task)]);
    expect(calls).toBe(1);
    expect([a, b]).toEqual(["details", "details"]);

    // Once finished, the key is free again: dedupe is for work in flight, not a cache.
    await queue.enqueue("show:1", task);
    expect(calls).toBe(2);
  });

  it("never runs more than its concurrency at once", async () => {
    const queue = new RefreshQueue({ concurrency: 4, gate: new RateGate({}) });
    let running = 0;
    let peak = 0;
    const task = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running -= 1;
    };

    await Promise.all(Array.from({ length: 12 }, (_, i) => queue.enqueue(`show:${i}`, task)));
    expect(peak).toBe(4);
    expect(queue.size).toBe(0);
  });

  it("spaces the starts of calls through one gate, and leaves other gates alone", async () => {
    const clock = fakeClock();
    const gate = new RateGate({ tmdb: 100, plex: 0 }, clock);
    const queue = new RefreshQueue({ concurrency: 4, gate });
    const started: [string, number][] = [];
    const task = (name: string) => async () => {
      started.push([name, clock.now()]);
    };

    const all = Promise.all([
      queue.enqueue("a", task("a"), "tmdb"),
      queue.enqueue("b", task("b"), "tmdb"),
      queue.enqueue("c", task("c"), "tmdb"),
      queue.enqueue("p", task("p"), "plex"),
    ]);

    await tick();
    expect(started).toEqual([
      ["a", 0],
      ["p", 0],
    ]);
    await clock.advance(99);
    expect(started.map(([n]) => n)).toEqual(["a", "p"]);
    await clock.advance(1);
    expect(started.at(-1)).toEqual(["b", 100]);
    await clock.advance(100);
    expect(started.at(-1)).toEqual(["c", 200]);
    await all;
  });

  it("passes a task's failure to its caller and carries on", async () => {
    const queue = new RefreshQueue({ concurrency: 1, gate: new RateGate({}) });
    const failing = queue.enqueue("bad", async () => {
      throw new Error("TMDB 500");
    });
    const fine = queue.enqueue("good", async () => "ok");
    await expect(failing).rejects.toThrow("TMDB 500");
    await expect(fine).resolves.toBe("ok");
  });
});
