/**
 * [W2] The Question — the invariants that live in SQL and the edge functions.
 *
 * Source-level, because these are Deno functions and Postgres DDL with no
 * runner here, and because the properties that matter are structural:
 *
 *   1. ONLY REAL ANSWERS. Nothing generated or seeded may carry a question_id
 *      or surface under the filter. The whole proposition is "other real
 *      people answered this", and one padded answer makes it a lie the reader
 *      cannot detect.
 *   2. The pipeline is untouched. An answer is an ordinary confession and
 *      faces every gate in the same order.
 *   3. The filter narrows the safe set; it never widens it.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
/** DDL with SQL comments stripped — guards must test code, not prose. */
const ddl  = (s: string) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

const MIG = read('supabase', 'migrations', '20260928000001_weekly_question.sql');
const sql = ddl(MIG);
const submit = read('supabase', 'functions', 'submit-confession', 'index.ts');
const recommend = read('supabase', 'functions', 'recommend-confessions', 'index.ts');

// ─── Only real answers ───────────────────────────────────────────────────────

describe('nothing generated can ever answer a question', () => {
  it('a CHECK constraint forbids it at the table', () => {
    expect(sql).toMatch(/CHECK \(question_id IS NULL OR source = 'user'\)/);
  });

  it('the RPC filters source=\'user\' under the question filter', () => {
    expect(sql).toMatch(/c\.question_id = p_question_id AND c\.source = 'user'/);
  });

  it('the answer count counts only real users', () => {
    const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION current_question'));
    expect(fn).toMatch(/c\.source\s+=\s+'user'/);
  });

  it('the stats view counts only real users', () => {
    const view = sql.slice(sql.indexOf('CREATE OR REPLACE VIEW v_question_stats'));
    expect(view).toMatch(/c\.source\s+=\s+'user'/);
  });

  it('the client never tops a filtered feed up from the curated pool', () => {
    // FEED_FLOOR exists so the FEED is never empty. Applying it here would put
    // fabricated answers under a question real people answered.
    const api = code(read('lib', 'api.ts'));
    const fn  = api.slice(api.indexOf('export async function getRecommendations'));
    const body = fn.slice(0, fn.indexOf('export async function', 10));
    expect(body).toMatch(/if \(questionId\) \{\s*return \{ confessions: real/);
    // …and that early return comes BEFORE the top-up.
    expect(body.indexOf('if (questionId)')).toBeLessThan(body.indexOf('getDummyRecommendations'));
  });
});

// ─── The pipeline is unchanged ───────────────────────────────────────────────

describe('an answer is an ordinary confession', () => {
  const c = code(submit);

  it('the question is resolved AFTER every gate, just before the insert', () => {
    const q = c.indexOf('current_question');
    for (const gate of ['runModeration(rawText)', 'runCrisisCheck(rawText)', 'checkSubstance(rawText']) {
      expect(c.indexOf(gate)).toBeGreaterThan(-1);
      expect(c.indexOf(gate)).toBeLessThan(q);
    }
    expect(q).toBeLessThan(c.indexOf('account_id:             user.id'));
  });

  it('never rejects a confession because of the question field', () => {
    const start = c.indexOf('let questionId');
    expect(start).toBeGreaterThan(-1);
    // Searched FORWARD from `start`. submit-confession contains an earlier
    // from('confessions') for the generated companion, so an unanchored
    // indexOf returns a position BEFORE this block and slice() then yields an
    // empty string that passes every assertion vacuously — which is exactly
    // what this guard did until a mutation test caught it.
    const end = c.indexOf(".from('confessions')", start);
    expect(end).toBeGreaterThan(start);
    const block = c.slice(start, end);
    expect(block.length).toBeGreaterThan(50);
    expect(block).not.toMatch(/return json\(/);
    expect(block).not.toMatch(/throw /);
  });

  it('keeps the id only when it is the live question', () => {
    expect(c).toMatch(/if \(liveId && liveId === body\.question_id\) questionId = body\.question_id/);
  });

  it('defaults to null for anything else', () => {
    expect(c).toMatch(/let questionId: string \| null = null/);
    expect(c).toMatch(/UUID_RE\.test\(body\.question_id\)/);
  });

  it('stores only what the writer wrote — never the question', () => {
    const insert = c.slice(c.indexOf('.from(\'confessions\')'), c.indexOf('.select(\'id\')'));
    expect(insert).toMatch(/text:\s+rawText/);
    // No concatenation of the question into the stored text.
    expect(insert).not.toMatch(/question.*\+.*rawText|rawText.*\+.*question/);
  });

  it('the crisis branch returns before the question is ever read', () => {
    const crisisIdx = c.indexOf('runCrisisCheck(rawText)');
    const between   = c.slice(crisisIdx, c.indexOf('let questionId'));
    expect(between).toMatch(/return json\(/);
  });
});

// ─── The filter cannot bypass a safety filter ────────────────────────────────

describe('the question filter narrows, never widens', () => {
  const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION recommend_confessions'));

  it('keeps every existing safety filter in the same WHERE', () => {
    for (const f of [
      "c.status IN ('live', 'approved')",
      'c.author_token <> p_author_token',
      'c.author_token NOT IN (SELECT token FROM banned_tokens)',
      "'sexuality_intimacy' = ANY(c.categories)",
    ]) expect(fn).toContain(f);
  });

  it('adds the question as an AND, never an OR that could widen the set', () => {
    expect(fn).toMatch(/AND \(p_question_id IS NULL OR \(c\.question_id = p_question_id AND c\.source = 'user'\)\)/);
  });

  it('replaces the old signature instead of overloading it', () => {
    // CREATE OR REPLACE with an extra argument creates a SECOND function and
    // makes every call ambiguous. The old one has to be dropped explicitly.
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS recommend_confessions\(uuid, text, extensions\.vector, text\[\], bool, int\)/);
  });

  it('stays service-role only', () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION\s*\n?\s*recommend_confessions\([^)]*\)\s*\n?\s*FROM public, anon, authenticated/);
  });

  it('the edge function validates only the SHAPE and lets SQL decide', () => {
    const r = code(recommend);
    expect(r).toMatch(/UUID_RE\.test\(body\.questionId\)/);
    expect(r).toMatch(/p_question_id:\s+questionId/);
  });

  it('skips re-ranking and diversity under the filter', () => {
    // Both would reorder or drop answers from a list that claims to be every
    // answer so far.
    const r = code(recommend);
    const early = r.indexOf('if (questionId) {');
    expect(early).toBeGreaterThan(-1);
    // Compared against the CALL, not the definition — selectWithDiversity is
    // declared near the top of the file, long before the handler runs.
    const call = r.indexOf('selectWithDiversity(explored');
    expect(call).toBeGreaterThan(-1);
    expect(early).toBeLessThan(call);
  });
});

// ─── The bank ────────────────────────────────────────────────────────────────

describe('the question bank', () => {
  const rows = [...MIG.matchAll(/\(\s*(\d+), DATE '(\d{4}-\d{2}-\d{2})', '(.*)'\)/g)]
    .map((m) => ({ position: Number(m[1]), startsOn: m[2], text: m[3] }));

  it('has all 28, in order', () => {
    expect(rows).toHaveLength(28);
    expect(rows.map((r) => r.position)).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
  });

  it('starts on Monday 2026-10-05 and runs weekly', () => {
    expect(rows[0].startsOn).toBe('2026-10-05');
    for (let i = 0; i < rows.length; i++) {
      const d = new Date(rows[i].startsOn + 'T00:00:00Z');
      expect(d.getUTCDay()).toBe(1);                       // every one a Monday
      if (i > 0) {
        const prev = new Date(rows[i - 1].startsOn + 'T00:00:00Z');
        expect((d.getTime() - prev.getTime()) / 86_400_000).toBe(7);
      }
    }
    expect(rows[27].startsOn).toBe('2027-04-12');
  });

  it('keeps the exact approved text, curly punctuation included', () => {
    expect(rows[0].text).toBe('What’s sitting in your drafts that you’ll never send?');
    expect(rows[4].text).toBe('What are you only doing because of “log kya kahenge”?');
    expect(rows[27].text).toBe('When did you last feel something bigger was listening?');
  });

  it('fits the 120-character column', () => {
    for (const r of rows) expect(r.text.length).toBeLessThanOrEqual(120);
  });

  it('never invites a name, a place or a workplace', () => {
    // The same rule the sentence starters live by: a prompt that asks someone
    // to identify a third party puts a person here who never consented, on a
    // surface with no reply channel to object through.
    for (const r of rows) {
      expect(r.text).not.toMatch(/\b(name|named|which city|your school|your company|who is)\b/i);
      expect(r.text).not.toMatch(/\[|\]|_{2,}/);
    }
  });

  it('never fishes for crisis or sexual content', () => {
    for (const r of rows) {
      expect(r.text.toLowerCase()).not.toMatch(
        /\b(kill|suicide|die|self.?harm|hurt yourself|sex|sexual|nude|body count)\b/);
    }
  });

  it('is asked in the first person, about the reader', () => {
    for (const r of rows) {
      expect(r.text).toMatch(/\byou\b|\byour\b/i);
      expect(r.text.endsWith('?')).toBe(true);
    }
  });
});

// ─── current_question() ──────────────────────────────────────────────────────

describe('current_question', () => {
  const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION current_question'),
                       sql.indexOf('REVOKE EXECUTE ON FUNCTION current_question'));

  it('bounds the week at both ends, so the bank running out returns nothing', () => {
    // A "latest started question" query would leave the last one up forever.
    expect(fn).toMatch(/q\.starts_on <= \(now\(\) AT TIME ZONE 'Asia\/Kolkata'\)::date/);
    expect(fn).toMatch(/\(now\(\) AT TIME ZONE 'Asia\/Kolkata'\)::date < q\.starts_on \+ 7/);
  });

  it('runs on Asia/Kolkata, not the server clock', () => {
    expect((fn.match(/Asia\/Kolkata/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('withholds the count below three', () => {
    expect(fn).toMatch(/CASE WHEN counted\.n >= 3 THEN counted\.n ELSE NULL END/);
  });

  it('counts only live and approved answers', () => {
    expect(fn).toMatch(/c\.status\s+IN \('live', 'approved'\)/);
  });

  it('is readable by authenticated users only', () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION current_question\(\) FROM anon/);
    expect(sql).toMatch(/GRANT\s+EXECUTE ON FUNCTION current_question\(\) TO\s+authenticated/);
  });
});

// ─── RLS ─────────────────────────────────────────────────────────────────────

describe('the questions table', () => {
  it('has RLS on', () => {
    expect(sql).toMatch(/ALTER TABLE questions ENABLE ROW LEVEL SECURITY/);
  });

  it('hides questions whose week has not begun', () => {
    const policy = sql.slice(sql.indexOf('CREATE POLICY questions_read_live'));
    expect(policy).toMatch(/starts_on <= \(now\(\) AT TIME ZONE 'Asia\/Kolkata'\)::date/);
    expect(policy).toMatch(/status = 'approved'/);
    expect(policy).toMatch(/FOR SELECT TO authenticated/);
  });

  it('allows no client writes at all', () => {
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON questions FROM anon, authenticated/);
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE)/);
  });

  it('caps the text at 120 characters', () => {
    expect(sql).toMatch(/char_length\(text\) <= 120/);
  });
});

// ─── The share source ────────────────────────────────────────────────────────

describe("the 'question' share source is added everywhere", () => {
  it('to both database CHECKs', () => {
    expect(sql).toMatch(/share_tokens[\s\S]*?CHECK \(bucket IN \('match', 'rtue', 'read', 'question'\)\)/);
    expect(sql).toMatch(/growth_events[\s\S]*?CHECK \(source IN \('match', 'rtue', 'read', 'question', 'unknown'\)\)/);
  });

  // Membership, not position. These originally pinned 'question' as the LAST
  // entry in each list, so adding the next source broke four guards that had
  // nothing to do with the change. What matters is that every list CONTAINS
  // it — the lists are allowed to grow.
  it('to the token minter and the beacon', () => {
    const minter = read('supabase', 'functions', 'create-share-token', 'index.ts');
    expect(minter).toMatch(/BUCKETS = \[[^\]]*'question'[^\]]*\]/);
    const beacon = read('supabase', 'functions', 'track', 'index.ts');
    expect(beacon).toMatch(/VALID_SOURCES = new Set\(\[[^\]]*'question'[^\]]*\]\)/);
    // 'unknown' is the beacon's catch-all and must survive any addition.
    expect(beacon).toMatch(/VALID_SOURCES = new Set\(\[[^\]]*'unknown'[^\]]*\]\)/);
  });

  it('to the client type and allowlist', () => {
    expect(read('lib', 'shareLink.ts'))
      .toMatch(/ShareSource =(?:[^;]*\|)?[^;]*'question'/);
    expect(read('lib', 'shareCard.ts'))
      .toMatch(/VALID_SHARE_SOURCES: ShareSource\[\] = \[[^\]]*'question'[^\]]*\]/);
  });

  it('and the link still carries only c= and t=', () => {
    const link = read('lib', 'shareLink.ts');
    expect(link).toContain('c=${encodeURIComponent(source)}');
    expect(link).toContain('&t=${token}');
    expect(code(link)).not.toMatch(/question_id|questionId/);
  });
});

// ─── The stats view is aggregate only ────────────────────────────────────────

describe('v_question_stats leaks nothing', () => {
  const view = sql.slice(sql.indexOf('CREATE OR REPLACE VIEW v_question_stats'),
                         sql.indexOf('REVOKE ALL ON v_question_stats'));

  it('exposes counts and a question id, and nothing else', () => {
    // The internal CTE reads account_id to work out each person's FIRST
    // confession; that is arithmetic, not exposure. What matters is the OUTER
    // select list — the columns the view actually hands the dashboard.
    const outer = view.slice(view.lastIndexOf('\nSELECT'), view.indexOf('\nFROM '));
    const cols  = outer
      .replace(/^\s*SELECT/, '')
      .split(',')
      .map((c) => (c.match(/AS\s+(\w+)\s*$/) ?? c.match(/(\w+)\s*$/))?.[1])
      .filter(Boolean);
    expect(cols.sort()).toEqual(
      ['answerers', 'answers', 'first_confession', 'position', 'question_id', 'starts_on']);
    // No confession text and no raw account id reaches the dashboard.
    expect(outer).not.toMatch(/c\.text|AS\s+account_id|AS\s+text/);
  });

  it('counts writer conversion — the number this phase exists to move', () => {
    expect(view).toMatch(/first_confession/);
  });

  it('is service-role only', () => {
    expect(sql).toMatch(/REVOKE ALL ON v_question_stats FROM anon, authenticated/);
  });
});

// ─── Nothing on the crisis path ──────────────────────────────────────────────

describe('the crisis path has no question UI', () => {
  const crisis = read('app', 'crisis.tsx');
  it.each(['question', 'Question', 'QuestionCard', 'current_question'])(
    'crisis.tsx does not reference %s', (f) => {
      expect(crisis).not.toContain(f);
    });
});
