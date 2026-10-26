/**
 * [NAV §4] The cache that stops Alerts and You blanking on return.
 *
 * Small enough to test exhaustively, and worth it: the two things it must
 * get right are a staleness boundary and a sign-out clear, and both fail
 * silently. A cache that never expires shows someone an hour-old alerts list
 * with no spinner and no sign anything is coming; a cache that survives
 * sign-out shows one account's private content to the next.
 */

import {
  readTabMemory, writeTabMemory, clearTabMemory, MAX_AGE_MS, TAB_MEMORY,
} from '@/lib/tabMemory';

beforeEach(() => clearTabMemory());

describe('reading back what a tab knew', () => {
  it('returns null for a slot nothing has written', () => {
    expect(readTabMemory(TAB_MEMORY.alerts)).toBeNull();
  });

  it('returns the value that was written', () => {
    writeTabMemory(TAB_MEMORY.alerts, [{ id: 'n1' }]);
    expect(readTabMemory(TAB_MEMORY.alerts)).toEqual([{ id: 'n1' }]);
  });

  it('keeps the two slots apart', () => {
    // One shared Map with hand-written string keys is one typo away from the
    // Alerts screen rendering the You screen's confessions.
    writeTabMemory(TAB_MEMORY.alerts, ['a']);
    writeTabMemory(TAB_MEMORY.myConfessions, ['c']);
    expect(readTabMemory(TAB_MEMORY.alerts)).toEqual(['a']);
    expect(readTabMemory(TAB_MEMORY.myConfessions)).toEqual(['c']);
  });

  it('remembers an EMPTY list as a real answer', () => {
    /**
     * "You have no alerts" is an answer with its own designed screen, and
     * re-showing a spinner to arrive at the same emptiness is the flicker
     * this whole module removes. An empty array must therefore read back as
     * an empty array, never as a miss.
     */
    writeTabMemory(TAB_MEMORY.alerts, []);
    expect(readTabMemory(TAB_MEMORY.alerts)).toEqual([]);
    expect(readTabMemory(TAB_MEMORY.alerts)).not.toBeNull();
  });
});

describe('staleness', () => {
  const T0 = 1_700_000_000_000;

  it('serves a value inside the window', () => {
    writeTabMemory(TAB_MEMORY.alerts, ['a'], T0);
    expect(readTabMemory(TAB_MEMORY.alerts, T0 + MAX_AGE_MS - 1)).toEqual(['a']);
  });

  it('drops it past the window', () => {
    writeTabMemory(TAB_MEMORY.alerts, ['a'], T0);
    expect(readTabMemory(TAB_MEMORY.alerts, T0 + MAX_AGE_MS + 1)).toBeNull();
  });

  it('is exactly at the boundary, not approximately', () => {
    // An off-by-one here is invisible in use and makes the window a guess.
    writeTabMemory(TAB_MEMORY.alerts, ['a'], T0);
    expect(readTabMemory(TAB_MEMORY.alerts, T0 + MAX_AGE_MS)).toEqual(['a']);
  });

  it('a stale read evicts, so the next one cannot resurrect it', () => {
    writeTabMemory(TAB_MEMORY.alerts, ['a'], T0);
    expect(readTabMemory(TAB_MEMORY.alerts, T0 + MAX_AGE_MS + 1)).toBeNull();
    // Even asked for again at a time that WOULD have been inside the window.
    expect(readTabMemory(TAB_MEMORY.alerts, T0 + 1)).toBeNull();
  });
});

describe('clearing', () => {
  it('empties every slot', () => {
    // Called on sign-out and on account deletion. Missing one slot means the
    // next account sees the previous one's content painted before its own
    // fetch returns.
    writeTabMemory(TAB_MEMORY.alerts, ['a']);
    writeTabMemory(TAB_MEMORY.myConfessions, ['c']);

    clearTabMemory();

    expect(readTabMemory(TAB_MEMORY.alerts)).toBeNull();
    expect(readTabMemory(TAB_MEMORY.myConfessions)).toBeNull();
  });
});

describe('nothing is persisted', () => {
  it('the module touches no storage at all', () => {
    /**
     * Deliberate, and the reason is in the module header: these two slots
     * hold one person's alerts and one person's own confessions. On disk
     * they would outlive the session and could be painted for whoever signs
     * in next, before any fetch had a chance to correct them. The feed cache
     * persists because the feed is other people's public confessions; this
     * one must not.
     */
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'lib', 'tabMemory.ts'), 'utf8');
    // Comments stripped: the header EXPLAINS why AsyncStorage is absent, and
    // a guard against a name would otherwise fail on the explanation.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    expect(code).not.toMatch(/AsyncStorage|SecureStore|localStorage|setItem/);
  });
});
