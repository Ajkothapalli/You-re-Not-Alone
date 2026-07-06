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

  it('get-my-confessions Edge Function never returns account_id to client', () => {
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'functions', 'get-my-confessions', 'index.ts'),
      'utf8',
    );
    // The select list must NOT include account_id
    expect(src).toContain("select('id, text, felt_count, status, created_at')");
    // Response must not include account_id
    const responseMatch = src.match(/return json\(\{[^}]*confessions[^}]*\}\)/);
    // Structural: account_id must not be referenced in what is returned
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

// ─── Manual verification checklist ───────────────────────────────────────────

describe('Manual verification required (cannot unit-test)', () => {
  it.todo('Native SVG: CategoryGlyph renders correct gradient colours on device');
  it.todo('Native SVG: CategoryBadge border colour matches category palette');
  it.todo('Google OAuth: sign-in completes and navigates to /welcome on fresh install');
  it.todo('Google OAuth: sign-in completes on Android without getting stuck loading');
  it.todo('Safety gate: submit with MODERATION_API_KEY unset → 503, nothing stored');
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
