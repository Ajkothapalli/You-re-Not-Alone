/**
 * Read signals, batched.
 *
 * Every impression, read_to_end, felt, share and report used to be its own
 * Edge Function round trip, fired from inside a scrolling FlatList. Scrolling
 * past ten cards meant ten HTTP requests racing the scroll — the single
 * biggest source of network work in the app, and all of it for analytics
 * nobody is waiting on.
 *
 * Now they queue and leave together: on a timer, when the tab loses focus,
 * and when the app backgrounds.
 *
 * ── What still goes immediately, and why ────────────────────────────────────
 * `felt` and `report` flush at once — but through the SAME queue, so they
 * carry any pending impressions with them rather than opening a second
 * connection. felt drives the counter the writer sees, and report is a safety
 * action: neither should sit in a buffer waiting for a timer. Everything else
 * can wait ten seconds.
 *
 * ── It must never be the reason something breaks ────────────────────────────
 * Nothing here is awaited by the UI, nothing throws, and a failed flush drops
 * its batch rather than retrying forever — a retry queue that outlives the
 * session would eventually replay stale signals against confessions that have
 * since been removed. Losing an impression costs a slightly worse
 * recommendation; blocking a scroll costs the reader the thing they came for.
 */

import type { ReadSignal } from './api';

export const FLUSH_INTERVAL_MS = 10_000;
/** Matches the server's cap. A larger batch is rejected, not truncated. */
export const MAX_BATCH = 100;
/** These are worth a round trip of their own. */
const IMMEDIATE: ReadSignal[] = ['felt', 'report'];

export interface QueuedSignal {
  confessionId: string;
  signal:       ReadSignal;
}

type Sender = (batch: QueuedSignal[]) => Promise<void>;

let queue: QueuedSignal[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let send: Sender | null = null;
let inFlight = false;

/** Wired once at startup; kept injectable so the queue is testable alone. */
export function configure(sender: Sender): void {
  send = sender;
}

/**
 * Queue a signal. Returns immediately, always.
 *
 * Duplicates are dropped: a card scrolling in and out of view fires the same
 * impression repeatedly, and the server would store every one of them.
 */
export function enqueue(confessionId: string, signal: ReadSignal): void {
  if (!confessionId) return;

  const duplicate = queue.some(
    (q) => q.confessionId === confessionId && q.signal === signal);
  if (!duplicate) queue.push({ confessionId, signal });

  // A queue that grows without bound is a memory leak on a long session.
  // Dropping the OLDEST keeps the most recent behaviour, which is the more
  // useful half for recommendations.
  if (queue.length > MAX_BATCH) queue = queue.slice(-MAX_BATCH);

  if (IMMEDIATE.includes(signal)) void flush();
  else startTimer();
}

function startTimer(): void {
  if (timer) return;
  timer = setInterval(() => { void flush(); }, FLUSH_INTERVAL_MS);
}

function stopTimer(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

/**
 * Send everything queued as ONE call.
 *
 * The queue is drained BEFORE the request so that signals arriving during the
 * flight land in the next batch instead of being sent twice.
 */
export async function flush(): Promise<void> {
  if (inFlight || queue.length === 0 || !send) return;

  const batch = queue;
  queue = [];
  stopTimer();
  inFlight = true;

  try {
    await send(batch);
  } catch {
    // Dropped on purpose — see the header.
  } finally {
    inFlight = false;
    if (queue.length > 0) startTimer();
  }
}

/** Tab blur and app background both land here. */
export function flushNow(): void {
  void flush();
}

/** Test seam, and what a sign-out should call. */
export function reset(): void {
  queue = [];
  stopTimer();
  inFlight = false;
}

export function pending(): QueuedSignal[] {
  return [...queue];
}
