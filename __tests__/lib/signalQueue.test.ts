/**
 * The read-signal batcher.
 *
 * It exists because every impression, felt and share was its own Edge
 * Function round trip, fired from inside a scrolling list. The property that
 * matters is ONE request per flush, no matter how many cards went past.
 */

import * as q from '@/lib/signalQueue';

let sent: q.QueuedSignal[][] = [];
let resolveSend: (() => void) | null = null;

beforeEach(() => {
  jest.useFakeTimers();
  q.reset();
  sent = [];
  resolveSend = null;
  q.configure(async (batch) => {
    sent.push(batch);
    if (resolveSend) await new Promise<void>((r) => { resolveSend = r; });
  });
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

const ID = (n: number) => `00000000-0000-0000-0000-00000000000${n}`;

describe('scrolling does not make a request per card', () => {
  it('queues without sending', () => {
    for (let i = 1; i <= 9; i++) q.enqueue(ID(i), 'impression');
    expect(sent).toHaveLength(0);
    expect(q.pending()).toHaveLength(9);
  });

  it('sends them all in ONE call on the interval', async () => {
    for (let i = 1; i <= 9; i++) q.enqueue(ID(i), 'impression');

    await jest.advanceTimersByTimeAsync(q.FLUSH_INTERVAL_MS);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toHaveLength(9);
  });

  it('drops duplicates — a card scrolled past twice is one impression', async () => {
    q.enqueue(ID(1), 'impression');
    q.enqueue(ID(1), 'impression');
    q.enqueue(ID(1), 'impression');

    await jest.advanceTimersByTimeAsync(q.FLUSH_INTERVAL_MS);
    expect(sent[0]).toHaveLength(1);
  });

  it('keeps different signals for the same confession', async () => {
    q.enqueue(ID(1), 'impression');
    q.enqueue(ID(1), 'read_to_end');

    await jest.advanceTimersByTimeAsync(q.FLUSH_INTERVAL_MS);
    expect(sent[0]).toHaveLength(2);
  });

  it('never exceeds the server\'s cap', async () => {
    for (let i = 0; i < 250; i++) q.enqueue(`id-${i}`, 'impression');
    expect(q.pending().length).toBeLessThanOrEqual(q.MAX_BATCH);
  });
});

describe('felt and report leave immediately', () => {
  it('felt flushes at once', async () => {
    q.enqueue(ID(1), 'felt');
    await Promise.resolve();
    expect(sent).toHaveLength(1);
  });

  it('report flushes at once', async () => {
    q.enqueue(ID(1), 'report');
    await Promise.resolve();
    expect(sent).toHaveLength(1);
  });

  it('carries queued impressions out with it, in the same request', async () => {
    // The point of routing them through the same queue: an urgent signal
    // should not open a SECOND connection alongside a pending batch.
    q.enqueue(ID(1), 'impression');
    q.enqueue(ID(2), 'impression');
    q.enqueue(ID(3), 'felt');
    await Promise.resolve();

    expect(sent).toHaveLength(1);
    expect(sent[0]).toHaveLength(3);
  });

  it('an impression alone does NOT flush immediately', () => {
    q.enqueue(ID(1), 'impression');
    expect(sent).toHaveLength(0);
  });
});

describe('blur and background flush', () => {
  it('flushNow sends whatever is queued', async () => {
    q.enqueue(ID(1), 'impression');
    q.flushNow();
    await Promise.resolve();
    expect(sent).toHaveLength(1);
  });

  it('flushing an empty queue sends nothing', async () => {
    q.flushNow();
    await Promise.resolve();
    expect(sent).toHaveLength(0);
  });
});

describe('it never breaks the UI', () => {
  it('a failed send drops the batch rather than retrying forever', async () => {
    q.configure(async () => { throw new Error('offline'); });
    q.enqueue(ID(1), 'felt');
    await Promise.resolve();
    await Promise.resolve();

    // Gone, not requeued: a retry queue outliving the session would replay
    // stale signals against confessions that may since have been removed.
    expect(q.pending()).toHaveLength(0);
  });

  it('enqueue never throws, even with nothing configured', () => {
    q.reset();
    q.configure(undefined as never);
    expect(() => q.enqueue(ID(1), 'impression')).not.toThrow();
  });

  it('ignores an empty confession id', () => {
    q.enqueue('', 'impression');
    expect(q.pending()).toHaveLength(0);
  });

  it('does not send twice while a flush is in flight', async () => {
    resolveSend = () => {};
    q.enqueue(ID(1), 'felt');
    await Promise.resolve();

    q.enqueue(ID(2), 'felt');
    await Promise.resolve();

    // The second signal waits for the first request to finish rather than
    // racing it.
    expect(sent).toHaveLength(1);
  });

  it('signals arriving mid-flight land in the NEXT batch, not this one', async () => {
    q.enqueue(ID(1), 'impression');
    q.flushNow();
    q.enqueue(ID(2), 'impression');
    await Promise.resolve();

    expect(sent[0].map((s) => s.confessionId)).toEqual([ID(1)]);
    expect(q.pending().map((s) => s.confessionId)).toEqual([ID(2)]);
  });
});

describe('the flush interval', () => {
  it('is around ten seconds — often enough to be current, rare enough to batch', () => {
    expect(q.FLUSH_INTERVAL_MS).toBeGreaterThanOrEqual(5_000);
    expect(q.FLUSH_INTERVAL_MS).toBeLessThanOrEqual(30_000);
  });
});
