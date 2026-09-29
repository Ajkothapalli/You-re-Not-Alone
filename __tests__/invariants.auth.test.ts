/**
 * [P2] The shared auth helper.
 *
 * Source-level: these are Deno functions importing from esm.sh, with no
 * runner here. The behavioural half (forged / expired / wrong-issuer tokens
 * are refused) was exercised against the deployed DEV functions over HTTP;
 * what this file pins is the shape, because the dangerous regressions are
 * structural — a function that stops checking bans, or one that starts
 * trusting a claim instead of a verified signature.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const FN_DIR = path.join(ROOT, 'supabase', 'functions');
const read = (...p: string[]) => fs.readFileSync(path.join(...p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

const helper = read(FN_DIR, '_shared', 'auth.ts');

/** Every deployed function (not the shared helpers). */
const FUNCTIONS = fs.readdirSync(FN_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name !== '_shared')
  .map((e) => e.name)
  .filter((n) => fs.existsSync(path.join(FN_DIR, n, 'index.ts')));

/** The 15 that authenticate a user. */
const AUTHED = FUNCTIONS.filter((n) =>
  code(read(FN_DIR, n, 'index.ts')).includes('verifyJwt'));

describe('the helper fails closed', () => {
  const c = code(helper);

  it('returns null for a missing or non-string token', () => {
    expect(c).toMatch(/if \(!jwt \|\| typeof jwt !== 'string'\) return null/);
  });

  it('requires a non-empty string subject', () => {
    // A verified token with no sub is malformed. Returning it as a user id
    // would hand every downstream query an empty account id.
    expect(c).toMatch(/typeof sub === 'string' && sub\.length > 0/);
  });

  it('every catch returns null — never a user, never a throw', () => {
    const catches = c.match(/catch\s*(\([^)]*\))?\s*\{[^}]*\}/g) ?? [];
    expect(catches.length).toBeGreaterThan(0);
    for (const block of catches) {
      expect(block).not.toMatch(/return \{/);
    }
  });

  it('falls back to getUser rather than to success', () => {
    // The fallback is SLOWER, not weaker — so falling back is always safe.
    expect(c).toContain('supabase.auth.getUser(jwt)');
    const fallback = c.slice(c.indexOf('supabase.auth.getUser(jwt)'));
    expect(fallback).toMatch(/if \(error \|\| !user\) return null/);
  });

  it('documents that revocation is no longer immediate', () => {
    // This is a real security trade-off, not a pure optimisation: a token
    // revoked mid-life stays valid until it expires. It must stay written
    // down where the next person changing this will read it.
    expect(helper).toMatch(/revocation|revoked/i);
    expect(helper).toMatch(/banned/);
  });
});

describe('all 15 authenticating functions use it', () => {
  it('found them', () => {
    expect(AUTHED).toHaveLength(15);
  });

  it.each(AUTHED)('%s calls verifyJwt and refuses on null', (name) => {
    const c = code(read(FN_DIR, name, 'index.ts'));
    expect(c).toMatch(/verifyJwt\(/);
    expect(c).toMatch(/if \(!user\)[\s\S]{0,80}401/);
  });

  it('none still calls auth.getUser directly', () => {
    // A direct call is a network round trip per request, and it bypasses the
    // one place this behaviour is documented and tested.
    for (const name of FUNCTIONS) {
      expect(code(read(FN_DIR, name, 'index.ts'))).not.toMatch(/auth\.getUser\(/);
    }
  });

  it('no function was left with a dead import and an unmigrated call', () => {
    // Exactly the half-migration a bulk edit produces when call sites differ
    // only by a variable name.
    for (const name of AUTHED) {
      const c = code(read(FN_DIR, name, 'index.ts'));
      expect(c).toMatch(/const user = await verifyJwt\(/);
    }
  });
});

describe('the checks AFTER auth are untouched', () => {
  // Verifying the signature locally says who is calling. It says nothing
  // about whether they are allowed to — that is still these.
  /**
   * `report` is deliberately absent: it has never checked bans, and that is
   * defensible — reporting is a SAFETY action, and refusing a banned account
   * the ability to flag harmful content would protect nobody. Verified
   * against the committed version, not assumed: this phase changed only its
   * auth lines.
   */
  const BAN_CHECKERS = ['submit-confession', 'edit-confession', 'recommend-confessions'];

  it.each(BAN_CHECKERS)('%s still refuses banned accounts', (name) => {
    const c = code(read(FN_DIR, name, 'index.ts'));
    expect(c).toMatch(/\.banned/);
    expect(c).toMatch(/403/);
  });

  it.each(BAN_CHECKERS)('%s still honours temp bans', (name) => {
    expect(code(read(FN_DIR, name, 'index.ts'))).toMatch(/temp_ban_expires_at/);
  });

  it('report still authenticates, even though it does not ban-check', () => {
    const c = code(read(FN_DIR, 'report', 'index.ts'));
    expect(c).toMatch(/const user = await verifyJwt\(/);
    expect(c).toMatch(/if \(!user\)[\s\S]{0,80}401/);
  });

  it('submit-confession still rate limits', () => {
    expect(code(read(FN_DIR, 'submit-confession', 'index.ts'))).toMatch(/429/);
  });

  it('moderation still fails closed', () => {
    for (const name of ['submit-confession', 'edit-confession', 'report']) {
      const c = read(FN_DIR, name, 'index.ts');
      expect(c).not.toMatch(/if \(IS_PRODUCTION\)[^\n]*\n[^\n]*pass:\s*true/);
    }
  });
});

describe('supabase-js is pinned', () => {
  it('no function imports the floating @2 tag', () => {
    // `@2` resolves to whatever esm.sh serves as latest, so two cold starts
    // could run different SDK versions with no deploy between them.
    for (const name of FUNCTIONS) {
      const c = read(FN_DIR, name, 'index.ts');
      expect(c).not.toMatch(/supabase-js@2['"]/);
      expect(c).not.toMatch(/supabase-js@2\//);
    }
  });

  it('every import names one exact version', () => {
    const versions = new Set<string>();
    for (const name of [...FUNCTIONS, '_shared']) {
      const dir = path.join(FN_DIR, name);
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.ts')) continue;
        for (const m of read(dir, f).matchAll(/supabase-js@([\d.]+)/g)) versions.add(m[1]);
      }
    }
    expect(versions.size).toBe(1);
    expect([...versions][0]).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
