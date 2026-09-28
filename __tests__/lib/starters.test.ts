/**
 * Sentence starters.
 *
 * The content assertions here matter more than the plumbing ones. A starter is
 * text this app puts into a stranger's mouth at the moment they are trying to
 * say something true, and the two ways that goes wrong are: prompting them to
 * name a third party who never consented to appear here, and sounding like a
 * clinician instead of a person.
 */

import { CATEGORY_IDS, CATEGORIES } from '@/lib/categories';
import {
  STARTERS, STARTERS_PER_CATEGORY, MAX_VISIBLE_STARTERS,
  startersFor, startersForReader, categoryOfStarter, isCategoryId,
} from '@/lib/starters';

const ALL = Object.values(STARTERS).flat();

describe('every category is covered', () => {
  it('has exactly 4 starters for each of the 7 categories', () => {
    expect(Object.keys(STARTERS).sort()).toEqual([...CATEGORY_IDS].sort());
    for (const id of CATEGORY_IDS) {
      expect(STARTERS[id]).toHaveLength(STARTERS_PER_CATEGORY);
    }
  });

  it('has no duplicates within or across categories', () => {
    expect(new Set(ALL).size).toBe(ALL.length);
  });

  it('every starter trails off rather than finishing the thought', () => {
    // A finished sentence would be our confession, not an opening for theirs.
    for (const s of ALL) expect(s.endsWith('…')).toBe(true);
  });
});

describe('a starter never invites identifying anyone', () => {
  it('asks for no name, place, employer or date', () => {
    for (const s of ALL) {
      expect(s).not.toMatch(/\b(name|named|called)\b/i);
      expect(s).not.toMatch(/\b(where|city|town|school|college|company|workplace)\b/i);
      // A blank to fill with a proper noun is the shape that does the damage.
      expect(s).not.toMatch(/\[|\]|<|>|_{2,}/);
    }
  });

  it('is written in the first person about the writer themselves', () => {
    // Every starter is the writer's own interior. One that opened with "They…"
    // or "She…" would be a prompt to narrate someone else.
    for (const s of ALL) {
      expect(s).toMatch(/\b(I|I'm|I'd|I've|my|me|us|nobody|what|the|if)\b/i);
      expect(s).not.toMatch(/^(He|She|They|His|Her|Their)\b/);
    }
  });

  it('carries no proper noun beyond a sentence-initial capital', () => {
    for (const s of ALL) {
      const mid = s.slice(1);
      // "I" and contractions of it are the only capitals allowed mid-sentence.
      const caps = mid.match(/(?<![A-Za-z'])[A-Z][a-z]+/g) ?? [];
      expect(caps).toEqual([]);
    }
  });

  it('does not sound clinical', () => {
    for (const s of ALL) {
      expect(s.toLowerCase()).not.toMatch(
        /\b(disorder|diagnos|therapy|therapist|symptom|treatment|patient|condition|cope|coping)\b/);
    }
  });

  it('never praises, grades or instructs the writer', () => {
    for (const s of ALL) {
      expect(s.toLowerCase()).not.toMatch(/\b(should|must|try to|brave|strong|well done|proud)\b/);
    }
  });
});

describe('startersFor', () => {
  it('returns that category\'s four', () => {
    expect(startersFor('grief')).toEqual(STARTERS.grief);
  });

  it.each(['', 'nonsense', 'crisis', 'sexuality_intimacy'])(
    'returns nothing for %j', (bad) => {
      expect(startersFor(bad)).toEqual([]);
    });

  it('has no category the taxonomy does not have — crisis above all', () => {
    // Crisis is never a category (CLAUDE.md #5) and must never gain starters.
    expect(Object.keys(STARTERS)).not.toContain('crisis');
  });
});

describe('startersForReader picks a spread, not a run', () => {
  it('shows one per chosen category before a second from any', () => {
    const out = startersForReader(['grief', 'secrets', 'relationships']);
    expect(out).toEqual([
      STARTERS.grief[0], STARTERS.secrets[0], STARTERS.relationships[0],
      STARTERS.grief[1],
    ]);
  });

  it('fills from one category when only one was chosen', () => {
    expect(startersForReader(['grief'])).toEqual([...STARTERS.grief]);
  });

  it('never returns more than the visible cap', () => {
    expect(startersForReader([...CATEGORY_IDS])).toHaveLength(MAX_VISIBLE_STARTERS);
  });

  it('still offers a way in when no categories are known', () => {
    // The blank page is the problem being solved. A reader whose preferences
    // failed to load is the LAST person who should get an empty row.
    for (const input of [[], ['bogus'], ['crisis']]) {
      const out = startersForReader(input);
      expect(out).toHaveLength(MAX_VISIBLE_STARTERS);
      expect(new Set(out).size).toBe(out.length);
    }
  });

  it('ignores unknown ids mixed in with real ones', () => {
    expect(startersForReader(['grief', 'bogus'])).toEqual([
      STARTERS.grief[0], STARTERS.grief[1], STARTERS.grief[2], STARTERS.grief[3],
    ]);
  });
});

describe('categoryOfStarter — for the analytics label', () => {
  it('finds the category of every starter', () => {
    for (const id of CATEGORY_IDS) {
      for (const s of STARTERS[id]) expect(categoryOfStarter(s)).toBe(id);
    }
  });

  it('returns null once the writer has edited it — which is not an error', () => {
    expect(categoryOfStarter('The truth is… I lied about everything')).toBeNull();
    expect(categoryOfStarter('anything else')).toBeNull();
  });

  it('is a category id, never text, that reaches analytics', () => {
    const c = categoryOfStarter(STARTERS.grief[0])!;
    expect(CATEGORIES.some((x) => x.id === c)).toBe(true);
    expect(isCategoryId(c)).toBe(true);
  });
});
