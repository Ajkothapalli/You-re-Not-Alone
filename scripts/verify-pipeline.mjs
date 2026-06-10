#!/usr/bin/env node
/**
 * verify-pipeline — automated pre-launch safety verification
 *
 * Checks every server-enforced invariant that can be tested without
 * embedding harmful content in the test suite. Run this against staging
 * before every production deploy.
 *
 * Required env:
 *   SUPABASE_URL      — e.g. https://xyzxyz.supabase.co
 *   SUPABASE_ANON_KEY — public anon key
 *   TEST_JWT          — Bearer token for a throwaway 18+ verified test account
 *
 * Optional env:
 *   SUPABASE_SERVICE_ROLE_KEY — enables DB-side assertions (crisis/store invariants)
 *
 * Flags:
 *   --rate-limit   — opt-in; submits up to 7 confessions to trigger 429.
 *                    Use on staging only — pollutes the confession pool.
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more checks failed, or env vars missing
 */

import { createClient } from '@supabase/supabase-js';

// ─── Env validation ───────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY     = process.env.SUPABASE_ANON_KEY;
const TEST_JWT     = process.env.TEST_JWT;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !TEST_JWT) {
  console.error(
    'Missing required env vars.\n' +
    '  SUPABASE_URL, SUPABASE_ANON_KEY, and TEST_JWT must all be set.\n' +
    '  TEST_JWT must be a valid Bearer token for a throwaway 18+ verified account.',
  );
  process.exit(1);
}

const RATE_LIMIT_MODE = process.argv.includes('--rate-limit');

const anonClient    = createClient(SUPABASE_URL, ANON_KEY);
const serviceClient = SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY) : null;

let failures = 0;

function pass(label)            { console.log(`  ✅  ${label}`); }
function fail(label, detail)    { console.error(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`); failures++; }
function skip(label)            { console.log(`  ⏭   ${label}`); }
function note(label)            { console.log(`  ℹ   ${label}`); }

function randomMarker() {
  // 8 uppercase hex chars — short enough to embed in text, unique enough not to collide
  return Math.random().toString(16).slice(2, 10).toUpperCase();
}

// ─── Edge Function caller ─────────────────────────────────────────────────────

async function submitConfession(text) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-confession`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${TEST_JWT}`,
        'apikey':        ANON_KEY,
      },
      body: JSON.stringify({ text, device_hash: 'verify-pipeline-script' }),
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  } catch (err) {
    return { status: 0, body: {}, networkError: err.message };
  }
}

// ─── Check 1: Identity separation ────────────────────────────────────────────
// Every probe uses the anon client. REVOKE ALL means every query must return
// a permission-denied error — not empty data, but an actual error.

async function checkIdentitySeparation() {
  console.log('\nCheck 1: Identity separation');

  // 1a — direct confessions table must be denied
  const { data: confData, error: confErr } = await anonClient
    .from('confessions')
    .select('*')
    .limit(1);

  if (confErr) {
    pass('anon SELECT on confessions → permission error (REVOKE working)');
  } else {
    fail(
      'anon SELECT on confessions succeeded',
      confData?.length
        ? `returned ${confData.length} row(s) — REVOKE ALL is not applied`
        : 'returned empty data without error — REVOKE ALL may not be applied',
    );
  }

  // 1b — author_token column must not be accessible through the public view
  //      (confessions_public defines SELECT id, text, felt_count, created_at only)
  const { data: tokenData, error: tokenErr } = await anonClient
    .from('confessions_public')
    .select('author_token')
    .limit(1);

  if (tokenErr) {
    pass('anon SELECT author_token from confessions_public → error (column not in view)');
  } else {
    const leaked = Array.isArray(tokenData) && tokenData.some((r) => 'author_token' in r);
    if (leaked) {
      fail('author_token is present in confessions_public rows', 'column-level REVOKE is broken');
    } else {
      // Query succeeded but the column is simply absent — the view correctly excludes it
      pass('author_token absent from confessions_public rows (view correctly excludes it)');
    }
  }

  // 1c — crisis_events must be denied
  const { data: crisisData, error: crisisErr } = await anonClient
    .from('crisis_events')
    .select('*')
    .limit(1);

  if (crisisErr) {
    pass('anon SELECT on crisis_events → permission error (REVOKE working)');
  } else {
    fail(
      'anon SELECT on crisis_events succeeded',
      crisisData?.length
        ? `returned ${crisisData.length} row(s) — REVOKE ALL is not applied`
        : 'returned empty data without error — REVOKE ALL may not be applied',
    );
  }
}

// ─── Check 2: Crisis path ─────────────────────────────────────────────────────
// Submits a crisis text and verifies:
//   (a) Edge Function returns {type:"crisis"} — not stored
//   (b) DB: no confession row stored (pipeline-order invariant)
//   (c) DB: crisis_events row created

async function checkCrisisPath() {
  console.log('\nCheck 2: Crisis path');

  const marker = randomMarker();
  const text   = `marker ${marker}: I don't want to be here anymore`;

  const { status, body, networkError } = await submitConfession(text);

  if (networkError) {
    fail('Edge Function unreachable', networkError);
    return;
  }

  if (status === 503) {
    fail(
      'Edge Function returned 503',
      'MODERATION_API_KEY may not be set, or ENVIRONMENT=production is missing',
    );
    return;
  }

  if (status === 200 && body.type === 'crisis') {
    pass('Edge Function returned 200 {type:"crisis"}');
  } else {
    fail(
      'Crisis path',
      `expected 200 {type:"crisis"}, got ${status} ${JSON.stringify(body)}`,
    );
    // Don't return — still try DB assertions if service key present
  }

  if (!serviceClient) {
    skip('DB assertions skipped (SUPABASE_SERVICE_ROLE_KEY not set)');
    note('To enable: set SUPABASE_SERVICE_ROLE_KEY and re-run');
    return;
  }

  // Must NOT have stored a confession row (CRISIS CHECK hard-returns before STORE)
  const { data: confRows, error: confRowErr } = await serviceClient
    .from('confessions')
    .select('id')
    .ilike('text', `%${marker}%`);

  if (confRowErr) {
    fail('DB assertion: confessions query error', confRowErr.message);
  } else if (!confRows.length) {
    pass('No confession row stored for crisis submission (pipeline-order invariant holds)');
  } else {
    fail(
      'Confession row stored for crisis submission',
      'STORE step ran before CRISIS CHECK returned — pipeline order is broken',
    );
  }

  // MUST have stored a crisis_events row (for human review)
  const { data: crisisRows, error: crisisRowErr } = await serviceClient
    .from('crisis_events')
    .select('id')
    .ilike('text', `%${marker}%`);

  if (crisisRowErr) {
    fail('DB assertion: crisis_events query error', crisisRowErr.message);
  } else if (crisisRows.length) {
    pass('crisis_events row created for human review');
  } else {
    fail('No crisis_events row found', 'CRISIS CHECK did not store the event');
  }
}

// ─── Check 3: Benign flow ─────────────────────────────────────────────────────
// Verifies that a normal confession round-trips correctly and that
// author_token never appears in the response at any path.

async function checkBenignFlow() {
  console.log('\nCheck 3: Benign flow');

  const marker = randomMarker();
  const text   = `marker ${marker}: I carry something too heavy to share with anyone I know`;

  const { status, body, networkError } = await submitConfession(text);

  if (networkError) {
    fail('Edge Function unreachable', networkError);
    return;
  }

  if (status === 503) {
    fail(
      'Edge Function returned 503',
      'MODERATION_API_KEY may not be set, or ENVIRONMENT=production is missing',
    );
    return;
  }

  if (status === 200 && (body.type === 'matched' || body.type === 'submitted')) {
    pass(`Edge Function returned 200 {type:"${body.type}"}`);
  } else {
    fail(
      'Benign flow',
      `expected 200 {type:"matched"|"submitted"}, got ${status} ${JSON.stringify(body)}`,
    );
  }

  // author_token must never appear in any response field
  const bodyStr = JSON.stringify(body);
  if (bodyStr.includes('author_token')) {
    fail(
      'Response body contains "author_token"',
      'Identity-linking field is leaking to clients — check Edge Function return paths',
    );
  } else {
    pass('Response contains no author_token field');
  }
}

// ─── Check 4: Rate limit (opt-in) ─────────────────────────────────────────────
// Submits up to 7 confessions in quick succession; expects a 429 before #7.
// --rate-limit flag required. Use only on staging — pollutes the confession pool.

async function checkRateLimit() {
  if (!RATE_LIMIT_MODE) return;

  console.log('\nCheck 4: Rate limit  [--rate-limit mode — staging only]');

  let got429 = false;
  for (let i = 1; i <= 7; i++) {
    const text = `rate limit probe ${i}: testing the pipeline under sustained load — please disregard`;
    const { status, networkError } = await submitConfession(text);

    if (networkError) {
      fail('Network error during rate-limit probe', networkError);
      return;
    }

    if (status === 429) {
      got429 = true;
      pass(`429 received on submission ${i} of 7`);
      break;
    }
  }

  if (!got429) {
    fail('Rate limit not triggered', '7 submissions completed without a 429');
  }
}

// ─── Run ──────────────────────────────────────────────────────────────────────

const SEP = '─'.repeat(60);

console.log('You Are Not Alone — safety pipeline verification');
console.log(`Target:          ${SUPABASE_URL}`);
console.log(`DB assertions:   ${serviceClient ? 'enabled (service key present)' : 'disabled (SUPABASE_SERVICE_ROLE_KEY not set)'}`);
if (RATE_LIMIT_MODE) console.log('Rate-limit mode: on  ⚠️  staging only');

await checkIdentitySeparation();
await checkCrisisPath();
await checkBenignFlow();
await checkRateLimit();

console.log('\n' + SEP);

if (failures === 0) {
  console.log('✅  All automated checks passed.\n');
  console.log('⚠️  One check still requires manual testing:');
  console.log('    Submit policy-violating text (e.g. hate speech) and confirm');
  console.log('    the Edge Function returns 200 {type:"blocked"}.');
  console.log('    This cannot be automated without embedding harmful content');
  console.log('    in the test suite.\n');
} else {
  console.error(`❌  ${failures} CHECK(S) FAILED — do not launch.`);
  process.exit(1);
}
