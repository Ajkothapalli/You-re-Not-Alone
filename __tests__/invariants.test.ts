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

describe('Identity separation — no account_id surface in client types', () => {
  it('ConfessionReceipt has no account_id field', async () => {
    // The receipt is an on-device store — it must never hold account_id
    const { saveReceipt, getReceipts, clearReceipts } = require('@/lib/confessionReceipt');
    await clearReceipts();
    await saveReceipt('test-id', 0, 'some text');
    const receipts = await getReceipts();
    expect(receipts[0]).toHaveProperty('id');
    expect(receipts[0]).not.toHaveProperty('account_id');
    expect(receipts[0]).not.toHaveProperty('author_token');
    await clearReceipts();
  });
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
});
