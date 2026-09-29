/**
 * [P1] Performance invariants.
 *
 * Performance work is uniquely easy to undo by accident: a well-meaning
 * "simplification" puts back an inline arrow, a sequential await, or an
 * object literal in a Provider, and nothing fails — the app just gets slow
 * again, quietly, and nobody notices for a release or two.
 *
 * These pin the shapes, and the product rules the optimisations must not
 * have bent on the way past.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
const ddl  = (s: string) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

const explore   = code(read('app', 'explore.tsx'));
const recommend = code(read('supabase', 'functions', 'recommend-confessions', 'index.ts'));
const perfSql   = ddl(read('supabase', 'migrations', '20260929000001_feed_perf.sql'));

// ─── Context values stay memoized ────────────────────────────────────────────

describe('no Provider passes a fresh object as its value', () => {
  // This was THE bottleneck: a changed context value re-renders every
  // consumer unconditionally, and React.memo cannot stop it because context
  // is not a prop. One inline literal here undoes every memo in the app.
  it.each([
    ['theme/ThemeProvider.tsx',    'ThemeContext'],
    ['lib/draftContext.tsx',       'Ctx'],
    ['lib/notificationsContext.tsx','NotificationsContext'],
    ['lib/premiumContext.tsx',     'PremiumContext'],
  ])('%s memoizes it', (file) => {
    const src = code(read(...file.split('/')));
    expect(src).toMatch(/useMemo\(/);
    // The shape that caused the problem: value={{ ... }}
    expect(src).not.toMatch(/Provider\s+value=\{\{/);
  });
});

// ─── The feed's callbacks stay stable ────────────────────────────────────────

describe('the feed does not mint closures per card', () => {
  it('passes stable callbacks, not inline arrows', () => {
    const renderItem = explore.slice(explore.indexOf('renderItem='), explore.indexOf('ItemSeparatorComponent'));
    expect(renderItem).toMatch(/onReport=\{handleReport\}/);
    expect(renderItem).toMatch(/onFelt=\{onCardFelt\}/);
    expect(renderItem).toMatch(/onPress=\{onCardPress\}/);
    // An inline arrow on any of the three defeats ReadCard's memo silently.
    expect(renderItem).not.toMatch(/on(Report|Felt|Press)=\{\(\)\s*=>/);
  });

  it('uses an index map rather than findIndex per separator', () => {
    expect(explore).toContain('indexById');
    expect(explore).not.toMatch(/confessions\.findIndex/);
  });

  it('keeps the list windowed', () => {
    for (const prop of ['initialNumToRender', 'maxToRenderPerBatch', 'windowSize', 'removeClippedSubviews']) {
      expect(explore).toContain(prop);
    }
  });

  it('ReadCard is memoized and takes ids', () => {
    const card = code(read('components', 'ReadCard.tsx'));
    expect(card).toMatch(/React\.memo\(ReadCardInner\)/);
    expect(card).toMatch(/onReport:\s+\(id: string\) => void/);
  });
});

// ─── Loading is parallel, not sequential ─────────────────────────────────────

describe('the feed loads in parallel', () => {
  it('uses one Promise.all rather than a chain of awaits', () => {
    const fn = explore.slice(explore.indexOf('async function fetchRecommendations'));
    const body = fn.slice(0, fn.indexOf('useEffect'));
    expect(body).toContain('Promise.all');
  });

  it('the recommender parallelises prefs, token and cold-start', () => {
    expect(recommend).toMatch(/Promise\.all\(\[[\s\S]{0,400}reader_preferences/);
  });

  it('the cold-start check stops counting every row the reader ever made', () => {
    // count: 'exact' tallies the whole history to answer "are there 5?".
    expect(recommend).not.toMatch(/count: 'exact'[\s\S]{0,200}read_events/);
    expect(recommend).toMatch(/\.limit\(5\)/);
  });
});

// ─── Signals are batched ─────────────────────────────────────────────────────

describe('read signals do not make a request per card', () => {
  it('logReadEvent queues instead of invoking', () => {
    const api = code(read('lib', 'api.ts'));
    const fn  = api.slice(api.indexOf('export async function logReadEvent'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toContain('signalQueue.enqueue');
    expect(body).not.toContain('functions.invoke');
  });

  it('the server takes an array and does ONE insert', () => {
    const block = recommend.slice(recommend.indexOf("if (action === 'signal')"));
    expect(block).toMatch(/Array\.isArray\(body\.signals\)/);
    // One insert, not one per entry. Bounded to the END of the handler, not
    // to the first `return json` — the empty-batch and oversized-batch guards
    // both return before the insert, so that slice was empty and the
    // assertion passed for the wrong reason.
    const handler = block.slice(0, block.indexOf("if (action !== 'recommend')"));
    const inserts = handler.match(/\.insert\(/g) ?? [];
    expect(inserts).toHaveLength(1);
    expect(handler).toMatch(/\.insert\(rows\)/);
  });

  it('still accepts the OLD single-signal shape', () => {
    // An app version older than this function is normal — OTA and store
    // rollouts are never simultaneous — and dropping its signals would
    // silently degrade recommendations for everyone who had not updated.
    const block = recommend.slice(recommend.indexOf("if (action === 'signal')"));
    expect(block).toMatch(/confessionId: body\.confessionId, signal: body\.signal/);
  });

  it('validates every entry, so one bad signal cannot poison a batch', () => {
    const block = recommend.slice(recommend.indexOf("if (action === 'signal')"));
    expect(block).toMatch(/UUID_RE_SIG\.test\(id\)/);
    expect(block).toMatch(/VALID_SIGNALS\.includes\(sig\)/);
  });

  it('rejects an oversized batch rather than truncating it', () => {
    const block = recommend.slice(recommend.indexOf("if (action === 'signal')"));
    expect(block).toMatch(/> MAX_BATCH[\s\S]{0,120}400/);
  });

  it('still updates taste per engagement signal', () => {
    const block = recommend.slice(recommend.indexOf("if (action === 'signal')"));
    expect(block).toContain('update_reader_taste');
  });
});

// ─── The SQL keeps every safety filter ───────────────────────────────────────

describe('the rewritten RPC is the same query', () => {
  it('uses NOT EXISTS for the seen-exclusion', () => {
    expect(perfSql).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM read_events e/);
    expect(perfSql).not.toMatch(/c\.id NOT IN \(SELECT confession_id/);
  });

  it.each([
    ["c.status IN ('live', 'approved')"],
    ['c.author_token <> p_author_token'],
    ['c.author_token NOT IN (SELECT token FROM banned_tokens)'],
    ["'sexuality_intimacy' = ANY(c.categories)"],
    ["c.question_id = p_question_id AND c.source = 'user'"],
  ])('still applies %s', (clause) => {
    expect(perfSql).toContain(clause);
  });

  it('stays service-role only', () => {
    expect(perfSql).toMatch(/REVOKE EXECUTE ON FUNCTION[\s\S]{0,140}FROM public, anon, authenticated/);
  });

  it('drops the old signature rather than overloading it', () => {
    expect(perfSql).toMatch(/DROP FUNCTION IF EXISTS recommend_confessions\([^)]*uuid\)/);
  });

  it('spells out the CONCURRENTLY forms for production', () => {
    // A plain CREATE INDEX takes an ACCESS EXCLUSIVE lock and blocks every
    // write to read_events while it builds.
    const raw = read('supabase', 'migrations', '20260929000001_feed_perf.sql');
    expect(raw).toContain('CREATE INDEX CONCURRENTLY');
    expect(raw).toMatch(/cannot run inside a transaction block/);
  });
});

// ─── The product rules are untouched ─────────────────────────────────────────

describe('none of this bent a product rule', () => {
  it('nothing loads on scroll and there is no refresh gesture', () => {
    expect(explore).not.toContain('onEndReached');
    expect(explore).not.toContain('RefreshControl');
    expect(explore).not.toContain('onRefresh');
  });

  it('"Keep reading" is still an explicit tap', () => {
    expect(explore).toContain('Keep reading');
  });

  it('the cache never becomes a source of content the server did not send', () => {
    const cache = code(read('lib', 'feedCache.ts'));
    expect(cache).not.toMatch(/getDummy|generated|seed/i);
  });

  it('a cached feed still expires rather than being shown indefinitely', () => {
    expect(code(read('lib', 'feedCache.ts'))).toMatch(/MAX_AGE_MS/);
  });
});
