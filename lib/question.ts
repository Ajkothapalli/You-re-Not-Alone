/**
 * The weekly question.
 *
 * One question a week, the same one for everyone, answered anonymously. It
 * exists to turn readers into writers: a blank page asks you to find something
 * to say, a question hands you the thing.
 *
 * ── What it is NOT ──────────────────────────────────────────────────────────
 * Not a second read surface (CLAUDE.md #2). The answers are a FILTER inside
 * the feed — same cards, same safety filters, same RPC — and there is no
 * screen anywhere that exists only to show them.
 *
 * ── Only real answers ───────────────────────────────────────────────────────
 * Nothing generated or seeded can carry a question_id: a CHECK constraint
 * forbids it, the RPC filters source='user', and the count below comes from
 * the server. The entire proposition is "other real people answered this", and
 * one padded answer would make that a lie no reader could detect.
 *
 * Every failure here is silent and yields no question. The feed must work
 * exactly as before when this is unavailable — it is an addition to the
 * surface, never a dependency of it.
 */

import { supabase } from './supabase';
import { withTimeout } from './withTimeout';

export interface LiveQuestion {
  id:        string;
  text:      string;
  startsOn:  string;
  /**
   * Null below three answers, by server policy. "1 answer" on a shared
   * question reads as nobody came, which discourages the next writer more
   * than showing no number at all.
   */
  answerCount: number | null;
}

/** Below this many answers, the server withholds the count entirely. */
export const ANSWER_COUNT_FLOOR = 3;

/** The question whose week contains right now, or null. Never throws. */
export async function getCurrentQuestion(): Promise<LiveQuestion | null> {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('current_question'), 4_000, 'question');
    if (error) return null;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.id || typeof row.text !== 'string') return null;

    const n = row.answer_count;
    return {
      id:          row.id,
      text:        row.text,
      startsOn:    row.starts_on,
      answerCount: typeof n === 'number' && Number.isFinite(n) ? n : null,
    };
  } catch {
    return null;
  }
}

/**
 * Enough answers to be worth reading?
 *
 * The server already withholds the count below the floor, so a null count and
 * a small count are the same thing here: don't offer "Read answers", offer
 * "Be one of the first to answer" instead. Sending someone to a list of two
 * is a worse first impression than inviting them to start it.
 */
export function hasReadableAnswers(q: LiveQuestion | null): boolean {
  return q !== null && q.answerCount !== null && q.answerCount >= ANSWER_COUNT_FLOOR;
}

/** The line shown on the card's secondary action. */
export function answersLabel(q: LiveQuestion | null): string {
  if (!hasReadableAnswers(q)) return 'Be one of the first to answer.';
  const n = q!.answerCount!;
  return `Read ${n} ${n === 1 ? 'answer' : 'answers'}`;
}
