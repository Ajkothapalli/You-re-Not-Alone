/**
 * The app may not claim the match is similar to what you wrote.
 *
 * Ground truth (owner decision 2026-09-13, supabase/migrations/
 * 20260913000001_category_matching.sql): submit-confession calls
 * match_confession_by_category(), which filters by overlapping CATEGORY and
 * language and then `ORDER BY random()`. There is no embedding in the write
 * flow, no score, and no ranking. match_confession() — the pgvector cosine
 * version — still exists and is unused.
 *
 * So "semantically close", "the exact person", "the same ache", "wrote the
 * same thing" are all false claims about what the product does. What is true:
 * someone else wrote about the same THING — the same territory — and one of
 * them was picked at random.
 *
 * This is the regression guard for that, and it is deliberately loud: the copy
 * drifted back toward similarity language once already, and an app that
 * overpromises on the match is making a promise to someone at their most
 * exposed. Note the guard scans SOURCE, including comments — a comment that
 * says "semantically close" is how the next person writes the string.
 */

import fs   from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const DIRS = ['app', 'lib', 'components'];

/** Every .ts/.tsx under the scanned directories. */
function sourceFiles(): string[] {
  const walk = (p: string): string[] =>
    fs.readdirSync(p, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(p, e.name);
      if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(full);
      return /\.tsx?$/.test(e.name) ? [full] : [];
    });
  return DIRS.flatMap((d) => walk(path.join(ROOT, d)));
}

/**
 * The banned claims.
 *
 * Note "wrote the same thing" is banned while "wrote about the same thing" is
 * the sanctioned replacement — the word "about" is load-bearing. It is the
 * difference between claiming two texts are equivalent and saying they share a
 * subject, which is the only thing the category filter actually establishes.
 */
const BANNED = /semantically|the exact person|same ache|wrote the same thing|one similar past confession/i;

describe('no similarity claims anywhere in app/, lib/ or components/', () => {
  const files = sourceFiles();

  it('finds source files to scan (guards against a silently empty sweep)', () => {
    // A walker that returns [] would make every assertion below vacuously
    // pass — the failure mode that lets a guard rot without anyone noticing.
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(files.map((f) => [path.relative(ROOT, f), f]))(
    '%s makes no similarity claim',
    (_rel, full) => {
      const src = fs.readFileSync(full as string, 'utf8');
      const hit = src.split('\n').findIndex((l) => BANNED.test(l));
      if (hit !== -1) {
        throw new Error(
          `${path.relative(ROOT, full as string)}:${hit + 1} claims the match is similar to what the ` +
          `reader wrote.\n\n    ${src.split('\n')[hit].trim()}\n\n` +
          `Matching is by CATEGORY + language, then ORDER BY random() — there is no ` +
          `similarity score to justify this. Say "wrote about the same thing", not ` +
          `"wrote the same thing". See supabase/migrations/20260913000001_category_matching.sql.`,
        );
      }
      expect(BANNED.test(src)).toBe(false);
    },
  );
});

describe('the sanctioned phrasing is actually in use', () => {
  // Guards the other direction: the ban above is satisfiable by deleting all
  // the copy. These assert the honest version survived.
  it('welcome describes writing about the same thing, not writing the same thing', () => {
    const src = fs.readFileSync(path.join(ROOT, 'app', 'welcome.tsx'), 'utf8');
    expect(src).toMatch(/wrote about the same/);
  });

  it('the match screen does not call the other confession similar', () => {
    const src = fs.readFileSync(path.join(ROOT, 'app', 'match.tsx'), 'utf8');
    expect(src).not.toMatch(/something similar/i);
  });

  it('api.ts documents category matching, not semantic matching', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'api.ts'), 'utf8');
    expect(src).toMatch(/match_confession_by_category/);
  });
});

describe('reading-allowance copy tells the truth about the cap', () => {
  const plans   = fs.readFileSync(path.join(ROOT, 'app', 'plans.tsx'), 'utf8');
  const explore = fs.readFileSync(path.join(ROOT, 'app', 'explore.tsx'), 'utf8');
  const cards   = fs.readFileSync(path.join(ROOT, 'components', 'EndOfReadingCards.tsx'), 'utf8');

  /**
   * Reading IS capped now (DAILY_ALLOWANCE per day from day one, owner
   * decision 2026-09-13). Copy promising otherwise is the specific failure
   * that produced a feed showing nothing behind words promising more.
   */
  const FALSE_FREEDOM = /reading is never gated|free forever|forever free|always unlimited|unlimited free/i;

  it.each([['plans', plans], ['explore', explore], ['end-of-reading cards', cards]])(
    '%s never claims reading is unlimited or free forever',
    (_name, src) => {
      expect(FALSE_FREEDOM.test(src as string)).toBe(false);
    },
  );

  it('plans names the real numbers rather than "your first reads are on us"', () => {
    expect(plans).toMatch(/DAILY_ALLOWANCE/);
    expect(plans).toMatch(/PER_WRITE/);
  });

  it('plans states what a plan never gates', () => {
    // §6's boundaries survived the override that let plans buy reading volume.
    expect(plans).toMatch(/Writing, reporting and the\s+felt counter are never behind a plan/);
    expect(plans).toMatch(/crisis resources are always\s+free/);
  });

  it('a capped reader is shown a cap, never an empty feed', () => {
    // The end-of-feed state names the number and what lifts it; the empty
    // state must not have grown a premium branch.
    expect(explore).toMatch(/That's your/);
    expect(explore).toMatch(/PER_WRITE/);
    expect(explore).not.toMatch(/<PremiumCard[^>]*\/>\s*<\/View>\s*\)\s*;?\s*\}\s*$/m);
  });

  it('nothing hardcodes a stale unlock number instead of PER_WRITE', () => {
    // app/match.tsx said "unlocked 2 more reads" long after PER_WRITE became 10.
    for (const [name, src] of [['plans', plans], ['explore', explore], ['cards', cards],
      ['match', fs.readFileSync(path.join(ROOT, 'app', 'match.tsx'), 'utf8')]] as const) {
      expect([name, /unlock(ed)?\s+\d+\s+more/i.test(src)]).toEqual([name, false]);
    }
  });
});
