/**
 * [3.6] SUBSTANCE — the invariants that live in the edge functions.
 *
 * Source-level, because these are Deno functions with no test runner here.
 * They pin the three things that would be catastrophic and silent:
 *
 *   1. Crisis precedence. The minimum-length check used to run BEFORE
 *      moderation and the crisis check, so "end it" and "kill me" were bounced
 *      as too short and never reached resources. The one person this pipeline
 *      exists for was the one it turned away. Ordering is the fix, and
 *      ordering is invisible in a diff — hence this file.
 *   2. The gate fails OPEN. It is quality, not safety.
 *   3. Rejected text is never logged, stored or sent anywhere.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const fn = (name: string) =>
  fs.readFileSync(path.join(ROOT, 'supabase', 'functions', name, 'index.ts'), 'utf8');

/** Character offset of a marker, so ORDER can be asserted. */
function at(src: string, needle: string): number {
  const i = src.indexOf(needle);
  expect(i).toBeGreaterThan(-1);
  return i;
}

describe.each([
  ['submit-confession', 'runCrisisCheck(rawText)'],
  ['edit-confession',   'runCrisisCheck(rawText)'],
])('%s: crisis precedence', (name, crisisCall) => {
  const src = fn(name);

  it('rejects EMPTY text early but never TOO SHORT', () => {
    expect(src).toContain("rawText.length === 0");
    // The old line. If it ever comes back, a short crisis message is bounced
    // again — this is the assertion that must never be relaxed.
    expect(src).not.toContain('rawText.length < 10');
  });

  it('runs the crisis check before the substance gate', () => {
    expect(at(src, crisisCall)).toBeLessThan(at(src, 'checkSubstance(rawText'));
  });

  it('runs moderation before the substance gate', () => {
    expect(at(src, 'runModeration(rawText)')).toBeLessThan(at(src, 'checkSubstance(rawText'));
  });

  it('returns from the crisis branch before substance can run', () => {
    // A hard return, not a flag: nothing after the crisis branch should be
    // reachable for crisis text.
    const crisisIdx = at(src, crisisCall);
    const substanceIdx = at(src, 'checkSubstance(rawText');
    const between = src.slice(crisisIdx, substanceIdx);
    expect(between).toMatch(/return json\(/);
  });
});

describe('the gate fails open, and stays quality-not-safety', () => {
  it.each(['submit-confession', 'edit-confession'])(
    '%s rejects with 422 and stores nothing',
    (name) => {
      const src = fn(name);
      expect(src).toMatch(/return json\(\{ error: 'not_genuine', reason: substance\.reason \}, 422\)/);
      // The gate runs BEFORE the row is written. Asserted by position against
      // the author's own insert specifically — submit-confession also contains
      // an earlier insert for generated companion text, on a different code
      // path, and matching that one would make this pass for the wrong reason.
      // edit-confession UPDATEs rather than inserts, and its first
      // from('confessions') is the ownership SELECT — also the wrong match.
      const insertMarker = name === 'submit-confession'
        ? 'account_id:             user.id'
        : '.update({';
      expect(at(src, 'checkSubstance(rawText')).toBeLessThan(at(src, insertMarker));
    },
  );

  it('moderation still fails closed — untouched by this change', () => {
    for (const name of ['submit-confession', 'edit-confession', 'report']) {
      const src = fn(name);
      expect(src).not.toMatch(/if \(IS_PRODUCTION\)[^\n]*\n[^\n]*pass:\s*true/);
    }
  });
});

describe('rejected text never leaves the function', () => {
  it.each(['submit-confession', 'edit-confession'])(
    '%s logs the reason code only',
    (name) => {
      const src = fn(name);
      const log = src.match(/console\.log\(`\[SUBSTANCE\][^`]*`\)/);
      expect(log).not.toBeNull();
      // The template may interpolate the reason and nothing else.
      const interpolations = log![0].match(/\$\{[^}]*\}/g) ?? [];
      expect(interpolations).toEqual(
        expect.arrayContaining([expect.stringContaining('substance.reason')]),
      );
      for (const i of interpolations) {
        expect(i).not.toMatch(/rawText|text|transcript/);
      }
    },
  );
});

describe('substance_check is server-only', () => {
  const sql = fs.readFileSync(
    path.join(ROOT, 'supabase', 'migrations', '20260926000001_substance_check.sql'), 'utf8');

  it('is REVOKEd from anon and authenticated', () => {
    expect(sql).toMatch(/REVOKE SELECT \(substance_check\) ON confessions FROM anon, authenticated/);
  });

  it('allows only passed and unchecked — there is no stored failure state', () => {
    expect(sql).toMatch(/CHECK \(substance_check IN \('passed', 'unchecked'\)\)/);
    // Comments stripped: the migration's own note explains that there is no
    // 'failed' value and why, and an unstripped search matches that sentence.
    const ddl = sql.replace(/^\s*--.*$/gm, '');
    expect(ddl).not.toMatch(/'failed'/);
  });

  it('does not rebuild confessions_public', () => {
    // Leaving the view alone is what keeps the column out of it. Rebuilding it
    // here would be the easy way to leak the column to every client.
    expect(sql).not.toMatch(/CREATE OR REPLACE VIEW confessions_public/);
  });

  it('appears in no other migration that defines the public view', () => {
    const dir = path.join(ROOT, 'supabase', 'migrations');
    for (const f of fs.readdirSync(dir)) {
      const s = fs.readFileSync(path.join(dir, f), 'utf8');
      if (!s.includes('CREATE OR REPLACE VIEW confessions_public')) continue;
      const view = s.slice(s.indexOf('CREATE OR REPLACE VIEW confessions_public'));
      expect(view.slice(0, view.indexOf('FROM'))).not.toContain('substance_check');
    }
  });
});

describe('the client mirror never blocks what the server would accept', () => {
  // A client stricter than the server would refuse a confession the server
  // would have taken — a silent, invisible false negative.
  const { isDraftReady } = require('@/lib/draftReady');
  const { checkLayer1 }  = require('../supabase/functions/_shared/substance');

  const CORPUS = [
    'I never loved him.', 'I miss her every single day',
    'मैं उससे कभी प्यार नहीं करता था', 'maine usse kabhi pyaar nahi kiya',
    '我从来没有爱过他', '私は彼を愛していなかった', 'ฉันไม่เคยรักเขาเลย',
    'sooo tired of pretending im fine',
    'I was 17 in 2009 and I still think about it',
    'hello', 'hi', '我爱你', '', '   ', 'just typed',
  ];

  it.each(CORPUS)('agrees with the server floor on %j', (text) => {
    const serverSaysTooShort = checkLayer1(text) === 'too_short';
    const clientSaysNotReady = !isDraftReady(text);
    expect(clientSaysNotReady).toBe(serverSaysTooShort);
  });
});
