/**
 * CLAUDE.md non-negotiable invariants — unit-testable subset.
 *
 * These tests assert structural/schema-level guarantees that can be checked
 * without hitting the network. For pipeline-order and DB-layer invariants
 * (moderation gate blocks, no account_id in confessions, read caps) see
 * scripts/verify-pipeline.mjs which runs against a live staging environment.
 */

import { CATEGORIES, CATEGORY_IDS } from '@/lib/categories';

// ─── §1 Safety gate stub rule ─────────────────────────────────────────────────
// We can't instantiate the Edge Function here, but we CAN verify the client
// bundle never contains the secrets it must never hold.

describe('Client bundle must not contain server secrets', () => {
  it('MODERATION_API_KEY is not exported from any lib file', () => {
    // The public API surface of lib/* must not reference the moderation key.
    // We check the actual lib/supabase.ts and lib/api.ts source for the string.
    const fs   = require('fs');
    const path = require('path');
    const libDir = path.join(__dirname, '..', 'lib');

    const files = fs.readdirSync(libDir).filter((f: string) => f.endsWith('.ts') || f.endsWith('.tsx'));
    for (const file of files) {
      const raw = fs.readFileSync(path.join(libDir, file), 'utf8');
      // Strip block comments (/* … */) and line comments (// …) before checking.
      // The supabase.ts JSDoc legitimately says "no AUTHOR_TOKEN_SECRET" as a
      // documentation invariant — that string in a comment is fine; in code it is not.
      const src = raw
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*/g, '');
      expect(src).not.toContain('MODERATION_API_KEY');
      expect(src).not.toContain('AUTHOR_TOKEN_SECRET');
      expect(src).not.toContain('EMBEDDING_API_KEY');
    }
  });

  it('MODERATION_API_KEY is not in any app/ screen file', () => {
    const fs   = require('fs');
    const path = require('path');
    const appDir = path.join(__dirname, '..', 'app');

    function scan(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { scan(full); continue; }
        if (!entry.name.match(/\.(ts|tsx)$/)) continue;
        const src = fs.readFileSync(full, 'utf8');
        expect(src).not.toContain('MODERATION_API_KEY');
        expect(src).not.toContain('AUTHOR_TOKEN_SECRET');
      }
    }
    scan(appDir);
  });
});

// ─── §3 Identity separation ───────────────────────────────────────────────────

describe('Identity separation — account_id never surfaces to clients (CLAUDE.md §3)', () => {
  it('ConfessionReceipt has no account_id field', async () => {
    const { saveReceipt, getReceipts, clearReceipts } = require('@/lib/confessionReceipt');
    await clearReceipts();
    await saveReceipt('test-id', 0, 'some text');
    const receipts = await getReceipts();
    expect(receipts[0]).toHaveProperty('id');
    expect(receipts[0]).not.toHaveProperty('account_id');
    expect(receipts[0]).not.toHaveProperty('author_token');
    await clearReceipts();
  });

  it('confessions_public view does not expose account_id or author_token (migration)', () => {
    const fs   = require('fs');
    const path = require('path');
    const sql  = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'migrations', '20260706000002_account_linked_confessions.sql'),
      'utf8',
    );
    // confessions_public must not SELECT account_id or author_token
    const viewMatch = sql.match(/CREATE OR REPLACE VIEW confessions_public[\s\S]*?;/);
    expect(viewMatch).not.toBeNull();
    const viewBody = viewMatch![0];
    expect(viewBody).not.toContain('account_id');
    expect(viewBody).not.toContain('author_token');
    // The REVOKE on account_id must be present
    expect(sql).toContain('REVOKE SELECT (account_id) ON confessions FROM anon, authenticated');
  });

  it('match_confession adds p_seeker_account exclusion in migration', () => {
    const fs   = require('fs');
    const path = require('path');
    const sql  = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'migrations', '20260706000002_account_linked_confessions.sql'),
      'utf8',
    );
    expect(sql).toContain('p_seeker_account');
    expect(sql).toContain('IS DISTINCT FROM p_seeker_account');
  });

  it('submit-confession stores account_id on INSERT', () => {
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'functions', 'submit-confession', 'index.ts'),
      'utf8',
    );
    expect(src).toContain('account_id:             user.id');
    expect(src).toContain('p_seeker_account: user.id');
  });

  it('get-my-confessions Edge Function never returns account_id or real_felt_count to client', () => {
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'functions', 'get-my-confessions', 'index.ts'),
      'utf8',
    );
    // account_id must NOT be in the select list
    expect(src).not.toMatch(/select\([^)]*account_id/);
    // real_felt_count must be selected server-side (for can_edit computation)
    expect(src).toContain('real_felt_count');
    // real_felt_count must be stripped before sending to client (destructured away in map)
    expect(src).toContain('{ real_felt_count, ...rest }');
    // can_edit is the only computed field sent to client
    expect(src).toContain('can_edit: real_felt_count === 0');
    // account_id must not appear in the return block
    const returnBlock = src.slice(src.lastIndexOf('return json'));
    expect(returnBlock).not.toContain('account_id');
  });

  it('manage-confession returns 403 on non-owner attempt (code path present)', () => {
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'functions', 'manage-confession', 'index.ts'),
      'utf8',
    );
    expect(src).toContain("return json({ error: 'Forbidden.' }, 403)");
    expect(src).toContain('isOwner');
    // Legacy HMAC fallback must be present
    expect(src).toContain('AUTHOR_TOKEN_SECRET');
    expect(src).toContain('hmacSha256');
  });

  it('dsar_delete_author_data NULLs account_id on legal-hold rows (migration)', () => {
    const fs   = require('fs');
    const path = require('path');
    const sql  = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'migrations', '20260706000002_account_linked_confessions.sql'),
      'utf8',
    );
    expect(sql).toContain('account_id = NULL');
    expect(sql).toContain('dsar_anonymize_author');
    expect(sql).toContain('dsar_delete_author_data');
  });

  it('delete-account Edge Function supports two-path deletion (erase / anonymize)', () => {
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'functions', 'delete-account', 'index.ts'),
      'utf8',
    );
    expect(src).toContain("'anonymize'");
    expect(src).toContain("'erase'");
    expect(src).toContain('dsar_anonymize_author');
    expect(src).toContain('dsar_delete_author_data');
  });
});

// ─── Manual verification checklist — account-linked confessions ───────────────
describe('Manual verification required — account-linked confessions', () => {
  it.todo('get-my-confessions: only returns confessions belonging to the authed user (cross-account leakage test)');
  it.todo('get-my-confessions: second device (same account) sees same confessions — cross-device confirmed');
  it.todo('manage-confession: 403 returned for non-owner request (different account_id)');
  it.todo('manage-confession: HMAC fallback works for legacy row (account_id IS NULL)');
  it.todo('delete-account erase: confessions deleted; legal-hold rows have account_id = NULL');
  it.todo('delete-account anonymize: confessions stay live; all have account_id = NULL');
  it.todo('confessions_public view: SELECT * returns no account_id or author_token column');
  it.todo('My confessions screen: "My confessions" entry appears in profile → opens formSheet');
  it.todo('My confessions screen: Remove button triggers confirm dialog; on confirm row shows removed badge');
  it.todo('invariants.test.ts new assertions all pass without hitting the network');
});

// ─── §5 Recommender hard rules ────────────────────────────────────────────────

describe('Category list hard rules (CLAUDE.md §5)', () => {
  it('sexual / adult category is absent', () => {
    const ids = CATEGORIES.map(c => c.id as string);
    const forbidden = ['sexuality_intimacy', 'adult', 'sexual', 'nsfw'];
    for (const f of forbidden) {
      expect(ids).not.toContain(f);
    }
    // Also check labels
    const labels = CATEGORIES.map(c => c.label.toLowerCase());
    expect(labels.every(l => !l.includes('sex') && !l.includes('adult'))).toBe(true);
  });

  it('crisis is never a category (§5 — crisis always routes to crisis screen)', () => {
    const ids = CATEGORIES.map(c => c.id as string);
    expect(ids).not.toContain('crisis');
    expect(ids).not.toContain('suicidal');
    expect(ids).not.toContain('self_harm');
  });

  it('all 7 approved categories are present', () => {
    const expected: string[] = [
      'mental_health',
      'relationships',
      'grief',
      'secrets',
      'work_identity',
      'body_health',
      'faith_meaning',
    ];
    for (const id of expected) {
      expect(CATEGORY_IDS).toContain(id);
    }
  });
});

// ─── §6 Share loop — crisis path must have zero share affordances ─────────────

describe('Share loop — no affordances on crisis path (CLAUDE.md §6)', () => {
  it('crisis screen (if present) has no shareConfessionCard import or call', () => {
    const fs   = require('fs');
    const path = require('path');
    const crisisPath = path.join(__dirname, '..', 'app', 'crisis.tsx');
    if (!fs.existsSync(crisisPath)) return; // passes vacuously when file absent
    const src = fs.readFileSync(crisisPath, 'utf8');
    expect(src).not.toContain('shareConfessionCard');
    expect(src).not.toContain('StoryCard');
    expect(src).not.toContain('cardShared');
  });

  it('share source buckets in lib/shareCard.ts are non-identifying strings only', () => {
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(
      path.join(__dirname, '..', 'lib', 'shareCard.ts'),
      'utf8',
    );
    expect(src).toContain("'match'");
    expect(src).toContain("'rtue'");
    expect(src).toContain("'read'");
    expect(src).not.toContain('account_id');
    expect(src).not.toContain('confession_id');
    expect(src).not.toContain('author_token');
    // Validation must throw, never silently pass
    expect(src).toContain('throw new Error');
  });
});

// ─── §2 No messaging / reply surface ─────────────────────────────────────────

describe('No reply surface in API exports (CLAUDE.md §2)', () => {
  it('lib/api.ts does not export any DM, reply, or message function', async () => {
    const api = require('@/lib/api');
    const keys = Object.keys(api);
    const forbidden = ['sendMessage', 'replyTo', 'sendDm', 'createThread', 'postReply'];
    for (const fn of forbidden) {
      expect(keys).not.toContain(fn);
    }
  });
});

describe('D7 launch route + the write gate it must not break (CLAUDE.md §2)', () => {
  const fs   = require('fs');
  const path = require('path');
  const read = (...p: string[]) =>
    fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

  it('index.tsx routes into the feed inside D7 and the read screen outside it', () => {
    const src = read('app', 'index.tsx');
    expect(src).toMatch(/isD7\(\)/);
    expect(src).toMatch(/router\.replace\(\s*d7\s*\?\s*'\/explore'\s*:\s*'\/read'\s*\)/);
  });

  it('explore.tsx satisfies the write gate, so Write cannot bounce D7 readers back to /read', () => {
    // write.tsx refuses to open until session.readShown is set, and read.tsx
    // used to be the only screen that set it. Routing D7 launches past /read
    // without this makes Write throw the reader back at the 2-card screen.
    const src = read('app', 'explore.tsx');
    expect(src).toContain('session.readShown = true');
  });

  it('the write gate itself is still in place — the feed satisfies it, never removes it', () => {
    const src = read('app', 'write.tsx');
    expect(src).toContain('session.readShown');
    expect(src).toMatch(/router\.replace\('\/read'\)/);
  });

  it('the read screen keeps its hard 2-cap — only the launch route moved', () => {
    // The owner decision changed where launch lands, not this surface.
    const src = read('app', 'read.tsx');
    expect(src).not.toMatch(/FlatList|onEndReached|RefreshControl/);
  });
});

// ─── §Lang / companion generation invariants ──────────────────────────────────

describe('Language-aware matching — source invariants', () => {
  it('match_confession migration adds lang filter and quality threshold', () => {
    const fs   = require('fs');
    const path = require('path');
    const sql  = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'migrations', '20260706000001_lang_matching.sql'),
      'utf8',
    );
    // Lang filter must be in the new match_confession body
    expect(sql).toContain('c.lang');
    // Quality threshold (cosine distance ≤ 1 − p_min_sim)
    expect(sql).toContain('p_min_sim');
    // Near-dup guard
    expect(sql).toContain('0.03');
    // Old arity-3 signature must be dropped
    expect(sql).toContain('DROP FUNCTION IF EXISTS match_confession');
  });

  it('submit-confession stores lang on every confession insert', () => {
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(
      path.join(
        __dirname, '..', 'supabase', 'functions', 'submit-confession', 'index.ts',
      ),
      'utf8',
    );
    expect(src).toContain('detectLanguage');
    expect(src).toContain('lang,');          // in the insert payload
    expect(src).toContain('p_seeker_lang');  // passed to match RPC
  });

  it('companion author_token is the SYSTEM token, never the requester token', () => {
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(
      path.join(
        __dirname, '..', 'supabase', 'functions', 'submit-confession', 'index.ts',
      ),
      'utf8',
    );
    // generateCompanion must insert with systemToken, not authorToken
    expect(src).toContain('getSystemToken');
    expect(src).toContain("hmacSha256('soulyap:auto'");
    // The companion insert MUST NOT use the requester's authorToken
    // Structural check: the function receives seekerToken but uses systemToken for insert
    expect(src).toContain('author_token:           systemToken');
  });

  it('companion generation runs full safety gate before inserting', () => {
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(
      path.join(
        __dirname, '..', 'supabase', 'functions', 'submit-confession', 'index.ts',
      ),
      'utf8',
    );
    // Both crisis and moderation checks must appear inside generateCompanion
    const companionFnStart = src.indexOf('async function generateCompanion');
    const companionFnEnd   = src.indexOf('\nasync function ', companionFnStart + 1);
    const companionBody    = companionFnEnd > 0
      ? src.slice(companionFnStart, companionFnEnd)
      : src.slice(companionFnStart);

    expect(companionBody).toContain('runCrisisCheck');
    expect(companionBody).toContain('runModeration');
    // Retries: must loop up to 3 attempts
    expect(companionBody).toContain('attempt < 3');
    // Fallback must also pass safety
    expect(companionBody).toContain('companionFallback');
    expect(companionBody).toContain('fbCrisis');
  });

  it('push-daily-stories passes lang to confession insert', () => {
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(
      path.join(
        __dirname, '..', 'supabase', 'functions', 'push-daily-stories', 'index.ts',
      ),
      'utf8',
    );
    expect(src).toContain('lang,');            // in the insert payload
    expect(src).toContain('seed_runs');        // idempotency table
    expect(src).toContain('already_ran_today'); // idempotency skip reason
  });

  it('seed_runs table is NOT accessible to anon or authenticated roles', () => {
    const fs   = require('fs');
    const path = require('path');
    const sql  = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'migrations', '20260706000001_lang_matching.sql'),
      'utf8',
    );
    expect(sql).toContain('REVOKE ALL ON seed_runs FROM anon, authenticated');
  });
});

// ─── §Source column / match threshold / retire / api_call_log ────────────────

describe('Source column, threshold, retire, api_call_log (Phase A–C)', () => {
  it('migration adds source column with correct CHECK constraint', () => {
    const fs   = require('fs');
    const path = require('path');
    const sql  = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'migrations', '20260706000003_source_column.sql'),
      'utf8',
    );
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS source text");
    expect(sql).toContain("'user'");
    expect(sql).toContain("'seed'");
    expect(sql).toContain("'generated'");
    expect(sql).toContain("source IN (");
  });

  it('confessions_public in source migration does not expose source column', () => {
    const fs   = require('fs');
    const path = require('path');
    const sql  = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'migrations', '20260706000003_source_column.sql'),
      'utf8',
    );
    const viewMatch = sql.match(/CREATE OR REPLACE VIEW confessions_public[\s\S]*?;/);
    expect(viewMatch).not.toBeNull();
    const viewBody = viewMatch![0];
    expect(viewBody).not.toContain('source');
    // REVOKE on source must be present
    expect(sql).toContain('REVOKE SELECT (source)');
  });

  it('api_call_log is REVOKED from anon and authenticated', () => {
    const fs   = require('fs');
    const path = require('path');
    const sql  = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'migrations', '20260706000003_source_column.sql'),
      'utf8',
    );
    expect(sql).toContain('api_call_log');
    expect(sql).toContain('REVOKE ALL ON api_call_log FROM anon, authenticated');
  });

  it('match_confession in source migration adds p_any_lang and updates default p_min_sim to 0.78', () => {
    const fs   = require('fs');
    const path = require('path');
    const sql  = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'migrations', '20260706000003_source_column.sql'),
      'utf8',
    );
    expect(sql).toContain('p_any_lang');
    expect(sql).toContain('0.78');
    expect(sql).toContain('p_min_sim');
  });

  it('submit-confession uses two-pass match strategy: MATCH_MIN=0.78, any-lang at 0.88', () => {
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'functions', 'submit-confession', 'index.ts'),
      'utf8',
    );
    expect(src).toContain('MATCH_MIN');
    expect(src).toContain('0.78');
    expect(src).toContain('MATCH_ANY_LANG');
    expect(src).toContain('0.88');
    // Pass 1: same lang
    expect(src).toContain('p_any_lang:    false');
    // Pass 2: any lang
    expect(src).toContain('p_any_lang:    true');
  });

  it("submit-confession stores source: 'user' on confession insert", () => {
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'functions', 'submit-confession', 'index.ts'),
      'utf8',
    );
    expect(src).toContain("source:                 'user'");
  });

  it("manage-confession uses action='retire' and sets status='retired'", () => {
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'functions', 'manage-confession', 'index.ts'),
      'utf8',
    );
    expect(src).toContain("'retire'");
    expect(src).toContain("'retired'");
    // Old action name must not appear
    expect(src).not.toContain("action === 'remove'");
  });

  it('manage-confession has rate limit using api_call_log', () => {
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'functions', 'manage-confession', 'index.ts'),
      'utf8',
    );
    expect(src).toContain('api_call_log');
    expect(src).toContain('manage-confession:retire');
  });

  it('write.tsx reads prefillText param and seeds the draft', () => {
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'write.tsx'),
      'utf8',
    );
    expect(src).toContain('prefillText');
    expect(src).toContain('useLocalSearchParams');
    expect(src).toContain('setDraft(prefillText)');
  });

  it('my-confessions.tsx imports retireConfession (not removeConfession)', () => {
    // The list lives on its own page again; app/(tabs)/you.tsx only shows a
    // summary card that drills into it, so this page is the live surface for
    // retire/edit and is the one that must keep the retire semantics.
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'my-confessions.tsx'),
      'utf8',
    );
    expect(src).toContain('retireConfession');
    expect(src).not.toContain('removeConfession');
    // Edit flow: navigates to the owner detail screen (not retire+prefill to /write)
    expect(src).toContain('/confession/[id]');
    expect(src).toContain('can_edit');
    // retired status must be handled
    expect(src).toContain("'retired'");
  });
});

describe('Safety gate has no environment escape hatch (CLAUDE.md §1)', () => {
  const fs   = require('fs');
  const path = require('path');
  const src  = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'functions', 'submit-confession', 'index.ts'),
    'utf8',
  );

  /** The body of the `if (!X)` guard that handles a missing key. */
  function missingKeyGuard(varName: string): string {
    const start = src.indexOf(`if (!${varName}) {`);
    expect(start).toBeGreaterThan(-1);
    return src.slice(start, start + 700);
  }

  // This is the hole that was live: runModeration() returned { pass: true }
  // whenever ENVIRONMENT !== 'production', and the deployed project ran with
  // ENVIRONMENT=development and an empty MODERATION_API_KEY — so every
  // submission was stored, matched and shown with no classification at all.
  // The old guard for this was `it.todo`, which never executes.
  it('a missing moderation key throws instead of passing the submission', () => {
    const guard = missingKeyGuard('MODERATION_API_KEY');
    expect(guard).toContain('throw');
    expect(guard).not.toContain('pass: true');
  });

  it('the moderation guard is not conditional on the environment', () => {
    // An env var must never be able to disable the gate. If this fails,
    // someone has reintroduced a dev bypass.
    const guard = missingKeyGuard('MODERATION_API_KEY');
    expect(guard).not.toContain('IS_PRODUCTION');
    expect(guard).not.toContain('ENVIRONMENT');
  });

  it('a CSAM detection with no NCMEC credentials fails closed everywhere', () => {
    // CLAUDE.md §4: detection and reporting stay on "permanently in all
    // environments". Silently filing no report is the exact failure this
    // forbids — "it was only development" is not a defence for an unfiled
    // mandatory report.
    const start = src.indexOf('if (!NCMEC_ESP_ID || !NCMEC_API_KEY) {');
    expect(start).toBeGreaterThan(-1);
    const guard = src.slice(start, start + 900);
    expect(guard).toContain('throw');
    expect(guard).not.toContain('IS_PRODUCTION');
  });

  it('edit-confession fails closed too — an unmoderated edit bypasses the submit gate', () => {
    // Post benign text, edit it to anything: without this, the final text
    // reaches the feed having been classified by nothing.
    const editSrc = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'functions', 'edit-confession', 'index.ts'),
      'utf8',
    );
    const start = editSrc.indexOf('if (!MODERATION_API_KEY) {');
    expect(start).toBeGreaterThan(-1);
    const guard = editSrc.slice(start, start + 700);
    expect(guard).toContain('throw');
    expect(guard).not.toContain('pass: true');
    expect(guard).not.toContain('IS_PRODUCTION');
  });

  it('the report function files or fails — never silently skips NCMEC', () => {
    const reportSrc = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'functions', 'report', 'index.ts'),
      'utf8',
    );
    const start = reportSrc.indexOf('if (!NCMEC_ESP_ID || !NCMEC_API_KEY) {');
    expect(start).toBeGreaterThan(-1);
    const guard = reportSrc.slice(start, start + 800);
    expect(guard).toContain('throw');
    expect(guard).not.toContain('IS_PRODUCTION');
  });

  it('moderation runs before the confession is ever inserted', () => {
    // Ordering is the other half of the invariant: the gate is worthless if
    // STORE can be reached without it.
    const mod    = src.indexOf('await runModeration(');
    const insert = src.indexOf(".from('confessions')\n      .insert");
    expect(mod).toBeGreaterThan(-1);
    if (insert > -1) expect(mod).toBeLessThan(insert);
  });
});

// ─── Manual verification checklist ───────────────────────────────────────────

describe('Manual verification required (cannot unit-test)', () => {
  it.todo('Native SVG: CategoryGlyph renders correct gradient colours on device');
  it.todo('Native SVG: CategoryBadge border colour matches category palette');
  it.todo('Google OAuth: sign-in completes and navigates to /welcome on fresh install');
  it.todo('Google OAuth: sign-in completes on Android without getting stuck loading');
  // Source-level guards now cover this (see "Safety gate has no environment
  // escape hatch" above). This entry stays because only a live call proves the
  // deployed function behaves that way — the source being right and the
  // deployment being right are two different facts, and for ~3 months they
  // disagreed.
  it.todo('Safety gate: submit against the DEPLOYED function with no key → 503, nothing stored');
  it.todo('Crisis path: crisis text → resources screen, no confession card, no counter');
  it.todo('Read cap: onboarding shows max 2 confessions (get_onboarding_confessions)');
  it.todo('Read cap: explore shows max 10 per session, no infinite scroll');
  it.todo('Plans (CLAUDE.md §6): no upsell on crisis path');
  it.todo('App Store billing: handleContinue() opens StoreKit / Play Billing sheet');
  // Language-aware matching (Part 1)
  it.todo('Language: submit English → match is English; submit te-Latn → companion is te-Latn, never English');
  it.todo('Language: similarity threshold — submit niche text with no resonant match → companion path fires, not a low-sim junk match');
  it.todo('Language: near-dup guard — submit nearly identical text twice (same user, different session) → second gets companion, not own text back');
  // Companion generation (Part 2)
  it.todo('Companion: generated text that fails moderation is blocked and retried; after 3 failures falls back to curated seed');
  it.todo('Companion: inserted confession has system author_token (HMAC("soulyap:auto", secret)), never the requester\'s token');
  it.todo('Companion: inserted confession has is_seed=true (server-only; NOT in confessions_public view)');
  it.todo('Companion: inserted confession has lang matching the seeker\'s detected lang');
  it.todo('Companion: returned as match — app shows "you\'re not alone" card, not "you\'re the first" screen');
  // Scheduler (Part 3)
  it.todo('Scheduler: cron job registered in pg_cron (SELECT jobname FROM cron.job WHERE jobname = \'soulyap-daily-seed\')');
  it.todo('Scheduler: manual net.http_post invokes push-daily-stories, inserts safety-gated rows with lang set');
  it.todo('Scheduler: seed_runs row created after each successful run');
  it.todo('Scheduler: calling twice same day → second invocation returns { skipped: true, reason: "already_ran_today" }');
  it.todo('Scheduler: generated confessions are in configured languages (en + hi-Latn + te-Latn by default)');
});
