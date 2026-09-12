/**
 * Regression guard for the detail-screen handoff.
 *
 * The bug this exists for: expo-router serialises route params through the URL
 * and strips newlines, so a confession pushed as `params: { text }` arrived at
 * read-detail with every "\n\n" gone — three paragraphs rendered as one run-on
 * block. Confirmed by logging the received param, so it was lost in transport,
 * not at render.
 *
 * The handoff carries the body in memory instead. These tests pin the two
 * things that actually matter: newlines survive, and a mismatched id falls
 * through to null so the caller can fall back to params.
 */

import {
  setConfessionHandoff,
  getConfessionHandoff,
} from '@/lib/confessionHandoff';

const THREE_PARAS =
  'First paragraph here.\n\nSecond paragraph here.\n\nThird paragraph here.';

describe('confession handoff', () => {
  it('returns the confession when the id matches', () => {
    setConfessionHandoff({ id: 'a1', text: THREE_PARAS, feltCount: 12, paletteIndex: 3 });
    const got = getConfessionHandoff('a1');
    expect(got).not.toBeNull();
    expect(got!.feltCount).toBe(12);
    expect(got!.paletteIndex).toBe(3);
  });

  it('preserves paragraph breaks — the whole reason this exists', () => {
    setConfessionHandoff({ id: 'a2', text: THREE_PARAS, feltCount: 0, paletteIndex: 0 });
    const got = getConfessionHandoff('a2');
    expect(got!.text).toBe(THREE_PARAS);
    expect(got!.text.split('\n\n')).toHaveLength(3);
  });

  it('returns null for a different id, so the caller falls back to params', () => {
    setConfessionHandoff({ id: 'a3', text: THREE_PARAS, feltCount: 0, paletteIndex: 0 });
    expect(getConfessionHandoff('some-other-id')).toBeNull();
  });

  it('returns null when no id is given (external deep link)', () => {
    setConfessionHandoff({ id: 'a4', text: THREE_PARAS, feltCount: 0, paletteIndex: 0 });
    expect(getConfessionHandoff(undefined)).toBeNull();
  });

  it('is replaced by the next navigation rather than accumulating', () => {
    setConfessionHandoff({ id: 'a5', text: 'first', feltCount: 1, paletteIndex: 0 });
    setConfessionHandoff({ id: 'a6', text: 'second', feltCount: 2, paletteIndex: 1 });
    expect(getConfessionHandoff('a5')).toBeNull();
    expect(getConfessionHandoff('a6')!.text).toBe('second');
  });

  it('survives being read more than once (the screen may re-render)', () => {
    setConfessionHandoff({ id: 'a7', text: THREE_PARAS, feltCount: 5, paletteIndex: 2 });
    expect(getConfessionHandoff('a7')!.text).toBe(THREE_PARAS);
    expect(getConfessionHandoff('a7')!.text).toBe(THREE_PARAS);
  });
});
