/**
 * [B] Referral invariants.
 *
 * The rule everything here protects: THE INVITER NEVER LEARNS ANYTHING ABOUT
 * THE INVITEE. The reward criteria depend on a confession the invitee wrote,
 * so any surface exposing why or when a reward landed would leak — by timing
 * alone — that a specific person wrote something. That is the author↔account
 * link CLAUDE.md #3 forbids, arriving through the back door.
 *
 * Second rule: rewards fail CLOSED. A false negative costs a free week; a
 * false positive is a programme that can be farmed.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const ROOT = path.join(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
const ddl  = (s: string) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

const MIG      = read('supabase', 'migrations', '20260928000003_referrals.sql');
const sql      = ddl(MIG);
const claim    = read('supabase', 'functions', 'claim-invite', 'index.ts');
const process_ = read('supabase', 'functions', 'process-referrals', 'index.ts');
const referral = read('lib', 'referral.ts');

// ─── The inviter learns nothing ──────────────────────────────────────────────

describe('the inviter never learns anything about the invitee', () => {
  it('the reward check returns a bare boolean', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION referral_reward_due\(p_referral_id uuid\)\s*\n\s*RETURNS boolean/);
  });

  it('it is SECURITY DEFINER and unreachable from any client', () => {
    expect(sql).toMatch(/referral_reward_due[\s\S]*?SECURITY DEFINER/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION referral_reward_due\(uuid\) FROM public, anon, authenticated/);
  });

  it('the referrals table is service-role only', () => {
    expect(sql).toMatch(/ALTER TABLE referrals ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON referrals FROM anon, authenticated/);
    // RLS on with NO policies means service_role alone.
    expect(sql).not.toMatch(/CREATE POLICY[^\n]*ON referrals/);
  });

  it('the thank-you notification mentions no writing, felt or timing', () => {
    const c = code(process_);
    const notif = c.slice(c.indexOf("from('notifications')"), c.indexOf('rewarded++'));
    for (const word of ['confession', 'wrote', 'write', 'felt', 'text', 'created_at', 'when']) {
      expect(notif.toLowerCase()).not.toContain(word);
    }
    // Only a day count travels.
    expect(notif).toMatch(/days:\s*REWARD_DAYS/);
  });

  it('the client module exposes no per-invitee surface', () => {
    const c = code(referral);
    // 'invitee' alone is too crude: giftWeekGranted('invitee') is a ROLE label
    // and entirely fine. What must not exist is any identifier or listing.
    for (const leak of [
      'inviteeAccount', 'invitee_account', 'invitee_id',
      'whoClaimed', 'referralList', 'listReferrals', 'invitees',
    ]) expect(c).not.toContain(leak);
    expect(c).not.toMatch(/from\('referrals'\)/);
  });

  it('process-referrals logs counts, never ids', () => {
    const logs = code(process_).match(/console\.(log|error)\([^)]*\)/g) ?? [];
    expect(logs.length).toBeGreaterThan(0);
    for (const l of logs) {
      expect(l).not.toMatch(/\br\.id\b|inviter_account|invitee|confession/);
    }
  });
});

// ─── Rewards fail closed ─────────────────────────────────────────────────────

describe('rewards fail closed', () => {
  it("'unchecked' substance waits rather than paying out", () => {
    // CLAUDE.md [3.6]: unchecked is NOT a pass. Reading it as one would make
    // an API outage the cheapest way to farm reward weeks.
    expect(sql).toMatch(/substance_check IS DISTINCT FROM 'passed'[\s\S]{0,40}RETURN false/);
  });

  it('a missing RevenueCat key grants nothing at all', () => {
    for (const src of [claim, process_]) {
      const c = code(src);
      expect(c).toMatch(/if \(!REVENUECAT_SECRET\)[\s\S]{0,200}return false/);
    }
  });

  it('never writes a local entitlement without RevenueCat agreeing', () => {
    // A local row RevenueCat does not know about is a silent pass: the app
    // shows premium, RevenueCat disagrees, and they never reconcile.
    for (const src of [claim, process_]) {
      const c = code(src);
      const guard  = c.indexOf('if (!REVENUECAT_SECRET)');
      const upsert = c.indexOf("from('entitlements')");
      expect(guard).toBeGreaterThan(-1);
      expect(guard).toBeLessThan(upsert);
    }
  });

  it('a failed grant leaves the referral pending for tomorrow', () => {
    expect(code(process_)).toMatch(/if \(!granted\) \{ failed\+\+; continue; \}/);
  });

  it('rewarding is guarded on status so two runs cannot pay twice', () => {
    expect(code(process_)).toMatch(/\.eq\('id', r\.id\)\.eq\('status', 'pending'\)/);
  });
});

// ─── The reward criteria ─────────────────────────────────────────────────────

describe('the criteria are all present', () => {
  const fn = sql.slice(sql.indexOf('FUNCTION referral_reward_due'), sql.indexOf('referral_cap_reached'));

  it.each([
    ['80 characters',        /char_count, 0\) < 80/],
    ['48 hours live',        /48 hours/],
    ['no authorship flags',  /authorship_flags/],
    ['not reported',         /FROM reports WHERE confession_id/],
    ['live or approved',     /status NOT IN \('live', 'approved'\)/],
    ['not auto-flagged',     /auto_flagged/],
    ['the 72h fallback',     /72 hours/],
  ])('checks %s', (_label, re) => {
    expect(fn).toMatch(re);
  });

  it('only the invitee\'s FIRST confession counts', () => {
    expect(fn).toMatch(/ORDER\s+BY created_at ASC\s*\n\s*LIMIT\s+1/);
  });

  it('the felt must come from a stranger on a stranger\'s device', () => {
    expect(fn).toMatch(/NOT IN \(r\.inviter_account, r\.invitee_account\)/);
    expect(fn).toMatch(/d_reader\.device_hash = d_party\.device_hash/);
  });

  it('caps at 4 per 30 days', () => {
    // Anchored: an unanchored `>= 4` also matches `>= 400`, so the guard
    // passed while the cap was effectively removed. A mutation test caught it.
    expect(sql).toMatch(/count\(\*\) >= 4\s*$/m);
    expect(sql).toMatch(/rewarded_at\s+> now\(\) - INTERVAL '30 days'/);
  });
});

// ─── Claim rejections ────────────────────────────────────────────────────────

describe('claim-invite rejects silently and for the right reasons', () => {
  const c = code(claim);

  it.each([
    'unknown_token', 'expired_token', 'self_invite',
    'same_device', 'device_claimed', 'account_claimed', 'account_too_old',
  ])('has a %s path', (reason) => {
    expect(c).toContain(reason);
  });

  it('never tells the user why', () => {
    // A reason shown to the user is a free oracle for a fraud probe, and an
    // accusation for an innocent person who merely reinstalled.
    expect(c).toMatch(/return json\(\{ claimed: false \}\)/);
    // The reason is a PARAMETER and a log line; what matters is that it never
    // reaches the response body. Assert on what is returned, not on the word.
    const reject = c.slice(c.indexOf('async function reject'), c.indexOf('serve('));
    expect(reject).toMatch(/console\.log/);
    const returned = reject.match(/return json\([^;]*\);/g) ?? [];
    expect(returned).toHaveLength(1);
    expect(returned[0]).not.toContain('reason');
  });

  it('uses an account-INDEPENDENT device fingerprint', () => {
    // The project's usual device hash salts with accountId, so two accounts on
    // one phone differ — the same-device checks would be permanent no-ops.
    expect(c).toMatch(/hmacSha256\(`referral:\$\{ua\}:\$\{ip\}`/);
    expect(c).not.toMatch(/hmacSha256\(`\$\{accountId\}:/);
  });

  it('grants before recording, so a row never promises a week that failed', () => {
    const grant = c.indexOf('const granted = await grantPremiumDays');
    const insert = c.indexOf("from('referrals').insert");
    expect(grant).toBeGreaterThan(-1);
    expect(grant).toBeLessThan(insert);
  });
});

// ─── The website ─────────────────────────────────────────────────────────────

describe('the share landing page', () => {
  const page = fs.readFileSync(
    path.join(os.homedir(), 'Desktop', 'yana-website', 's', 'index.html'), 'utf8');

  it('accepts only a 10-character base62 token', () => {
    expect(page).toMatch(/\/\^\[A-Za-z0-9\]\{10\}\$\//);
  });

  it('puts a valid token in utm_content', () => {
    expect(page).toMatch(/referrer \+= '&utm_content=' \+ token/);
  });

  it('drops an invalid token instead of forwarding it', () => {
    expect(page).toMatch(/if \(!\/\^\[A-Za-z0-9\]\{10\}\$\/\.test\(token\)\) token = ''/);
  });

  it('the beacon sends the bucket ONLY — never the token', () => {
    // Comments stripped — the note above the beacon explains that the token
    // must never reach it, and an unstripped search matches that explanation.
    const js = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const beacon = js.slice(js.indexOf('var payload'), js.indexOf('sendBeacon') + 120);
    expect(beacon).toMatch(/source: bucket/);
    expect(beacon).not.toContain('token');
    expect(beacon).not.toContain('utm_content');
  });
});

// ─── Share source 'invite' ───────────────────────────────────────────────────

describe("'invite' is a share source everywhere", () => {
  it('in both database CHECKs', () => {
    expect(sql).toMatch(/share_tokens[\s\S]*?CHECK \(bucket IN \([^)]*'invite'[^)]*\)\)/);
    expect(sql).toMatch(/growth_events[\s\S]*?CHECK \(source IN \([^)]*'invite'[^)]*\)\)/);
  });

  it('in the minter, the beacon, the type and the allowlist', () => {
    expect(read('supabase', 'functions', 'create-share-token', 'index.ts'))
      .toMatch(/BUCKETS = \[[^\]]*'invite'[^\]]*\]/);
    expect(read('supabase', 'functions', 'track', 'index.ts'))
      .toMatch(/VALID_SOURCES = new Set\(\[[^\]]*'invite'[^\]]*\]\)/);
    expect(read('lib', 'shareLink.ts')).toMatch(/ShareSource =[^;]*'invite'/);
    expect(read('lib', 'shareCard.ts'))
      .toMatch(/VALID_SHARE_SOURCES: ShareSource\[\] = \[[^\]]*'invite'[^\]]*\]/);
  });

  it('the link still carries only c= and t=', () => {
    const link = read('lib', 'shareLink.ts');
    expect(link).toContain('c=${encodeURIComponent(source)}');
    expect(link).toContain('&t=${token}');
    expect(code(link)).not.toMatch(/variant|referral|invitee/);
  });
});

// ─── No dark patterns, nothing on the crisis path ────────────────────────────

describe('the invite is never pushy', () => {
  it('is capped at one prompt a week', () => {
    expect(code(referral)).toMatch(/PROMPT_COOLDOWN_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
  });

  it('fails QUIET when it cannot tell — it does not ask', () => {
    const fn = code(referral).slice(code(referral).indexOf('export async function mayPromptForInvite'));
    expect(fn.slice(0, fn.indexOf('export async function markInvitePrompted')))
      .toMatch(/catch \{[\s\S]*?return false/);
  });

  it('uses no scarcity or urgency language', () => {
    // Stripped: both files' headers say in prose that they avoid this
    // language, which an unstripped search would flag as the language itself.
    const copy = (code(referral) + code(read('components', 'GiftWeekCard.tsx'))).toLowerCase();
    for (const w of ['hurry', 'expires soon', "don't miss", 'limited time', 'last chance', 'only today']) {
      expect(copy).not.toContain(w);
    }
  });

  it('both variants carry the honest timing line', () => {
    expect(code(referral)).toMatch(/HONEST_LINE = 'Your thank-you arrives once they’ve settled in\.'/);
  });

  it('nothing referral-related reaches the crisis path', () => {
    // Whole words only: a bare 'claim' substring matches "disclaimer", which
    // is legitimate crisis copy and has nothing to do with referrals.
    const crisis = read('app', 'crisis.tsx');
    for (const f of ['referral', 'Referral', 'GiftWeek', 'claimPendingInvite', 'claim-invite']) {
      expect(crisis).not.toContain(f);
    }
    for (const w of [/\binvite\b/i, /\bclaim\b/i, /\bpremium\b/i]) {
      expect(crisis).not.toMatch(w);
    }
  });
});

// ─── Analytics ───────────────────────────────────────────────────────────────

describe('referral analytics carry no identity', () => {
  const analytics = read('lib', 'analytics.ts');

  it('declares the six events', () => {
    for (const e of [
      'invite_entry_opened', 'invite_shared', 'invite_claimed',
      'invite_claim_rejected', 'gift_week_granted', 'referral_capped',
    ]) expect(analytics).toContain(e);
  });

  it('no payload declares a token, account or confession field', () => {
    const start = analytics.indexOf("'invite_entry_opened'");
    const block = code(analytics.slice(start, analytics.indexOf("'referral_capped'") + 120));
    expect(block).not.toMatch(/token|account|confession|invitee_id|email/);
    expect(block).toMatch(/variant:\s*string/);
    expect(block).toMatch(/reason:\s*string/);
  });
});
