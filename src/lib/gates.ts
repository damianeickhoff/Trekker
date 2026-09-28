import { RateGate } from "./queue";

/**
 * Milliseconds between call starts per endpoint. TMDB allows around fifty
 * requests a second; forty leaves room for whatever else shares the key. Plex
 * and Overseerr are somebody's home server, so they are asked gently. News
 * feeds are other people's websites, read once a day, one after another.
 * Trakt allows a thousand reads in five minutes per client id, and a comment
 * thread is read at most once an hour per episode, so one every 300ms is room.
 */
export const GATE_INTERVALS = { tmdb: 25, plex: 100, overseerr: 200, press: 500, trakt: 300 } as const;

export type GateName = keyof typeof GATE_INTERVALS;

const globalForGates = globalThis as unknown as { trekkerGate?: RateGate };

/** One per process, shared by the queue and the clients, so they draw on one budget. */
export const gate = (globalForGates.trekkerGate ??= new RateGate({ ...GATE_INTERVALS }));
