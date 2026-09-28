/**
 * The weekly question, client side.
 *
 * The rule that gets the most attention is the count floor. "1 answer" on a
 * shared question tells the next person nobody came, which is the opposite of
 * what this feature is for — so the server withholds the number below three
 * and the client must not invent one.
 */

const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));

import {
  getCurrentQuestion, hasReadableAnswers, answersLabel, ANSWER_COUNT_FLOOR,
} from '@/lib/question';

const ROW = {
  id: '11111111-2222-3333-4444-555555555555',
  text: 'What’s sitting in your drafts that you’ll never send?',
  starts_on: '2026-10-05',
  answer_count: 12,
};

beforeEach(() => { jest.clearAllMocks(); });

describe('reading the live question', () => {
  it('maps the RPC row', async () => {
    mockRpc.mockResolvedValue({ data: [ROW], error: null });
    await expect(getCurrentQuestion()).resolves.toEqual({
      id: ROW.id, text: ROW.text, startsOn: '2026-10-05', answerCount: 12,
    });
    expect(mockRpc).toHaveBeenCalledWith('current_question');
  });

  it('accepts a single object as well as a one-row array', async () => {
    mockRpc.mockResolvedValue({ data: ROW, error: null });
    await expect(getCurrentQuestion()).resolves.toMatchObject({ id: ROW.id });
  });

  it('returns null when the bank has run out', async () => {
    // current_question() returns NO ROW rather than repeating the last one.
    mockRpc.mockResolvedValue({ data: [], error: null });
    await expect(getCurrentQuestion()).resolves.toBeNull();
  });

  it('returns null rather than throwing on every failure', async () => {
    for (const result of [
      { data: null, error: { message: 'boom' } },
      { data: null, error: null },
      { data: [{ text: 'no id' }], error: null },
      { data: [{ id: 'x' }], error: null },
    ]) {
      mockRpc.mockResolvedValue(result);
      await expect(getCurrentQuestion()).resolves.toBeNull();
    }
    mockRpc.mockRejectedValue(new Error('offline'));
    await expect(getCurrentQuestion()).resolves.toBeNull();
  });

  it('treats a withheld count as null, not zero', async () => {
    // The difference matters: 0 would render "Read 0 answers".
    mockRpc.mockResolvedValue({ data: [{ ...ROW, answer_count: null }], error: null });
    const q = await getCurrentQuestion();
    expect(q!.answerCount).toBeNull();
  });
});

describe('the count floor', () => {
  const q = (n: number | null) => ({ id: 'a', text: 't', startsOn: 'd', answerCount: n });

  it('is three', () => {
    expect(ANSWER_COUNT_FLOOR).toBe(3);
  });

  it('offers reading only at or above it', () => {
    expect(hasReadableAnswers(q(3))).toBe(true);
    expect(hasReadableAnswers(q(99))).toBe(true);
  });

  it('does not below it, or with no count, or with no question', () => {
    for (const v of [null, 0, 1, 2]) expect(hasReadableAnswers(q(v))).toBe(false);
    expect(hasReadableAnswers(null)).toBe(false);
  });

  it('invites rather than showing an empty list', () => {
    expect(answersLabel(q(2))).toBe('Be one of the first to answer.');
    expect(answersLabel(q(null))).toBe('Be one of the first to answer.');
    expect(answersLabel(null)).toBe('Be one of the first to answer.');
  });

  it('names the number once there is one worth naming', () => {
    expect(answersLabel(q(3))).toBe('Read 3 answers');
    expect(answersLabel(q(41))).toBe('Read 41 answers');
  });

  it('never claims a fabricated number', () => {
    // Nothing here may invent, round up, or pad a count.
    for (const n of [3, 7, 250]) {
      expect(answersLabel(q(n))).toContain(String(n));
    }
  });
});
