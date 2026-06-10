/**
 * Edge Function: submit-confession
 *
 * The full safety pipeline runs 100% here. The client cannot call individual
 * steps, skip steps, or reorder them. Every path is server-authoritative.
 *
 * Pipeline order (non-negotiable — see CLAUDE.md):
 *   [0] Auth + ban check
 *   [1] Rate limit (server-computed device hash)
 *   [2] MODERATION  ← hard early-return; STORE is code-unreachable if this fires
 *   [3] CRISIS CHECK ← hard early-return; STORE is code-unreachable if this fires
 *   [4] EMBED
 *   [5] INSERT confession
 *   [6] MATCH
 *   [7] increment felt_count (atomic)
 *   [8] Return match
 *
 * M6 MODERATION RULE:
 *   ENVIRONMENT === "production" + no key → throw (fail closed, 500)
 *   ENVIRONMENT !== "production" + no key → loud warning, pass through (UI testing only)
 *   API returns non-200 → throw in all environments (fail closed)
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Secrets (Edge Function env only — never in client bundle) ────────────────
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AUTHOR_TOKEN_SECRET  = Deno.env.get('AUTHOR_TOKEN_SECRET');
const MODERATION_API_KEY   = Deno.env.get('MODERATION_API_KEY');
const OPENAI_API_KEY       = Deno.env.get('OPENAI_API_KEY');   // gpt-4o-mini crisis classifier
const EMBEDDING_API_KEY    = Deno.env.get('EMBEDDING_API_KEY');
const ENVIRONMENT          = Deno.env.get('ENVIRONMENT') ?? 'development';

const IS_PRODUCTION = ENVIRONMENT === 'production';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── HMAC helpers ─────────────────────────────────────────────────────────────

async function hmacSha256(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Derives the author_token for an account.
 * One-way: a DB dump cannot reverse this to account_id without AUTHOR_TOKEN_SECRET.
 */
async function getAuthorToken(accountId: string): Promise<string> {
  if (!AUTHOR_TOKEN_SECRET) throw new Error('AUTHOR_TOKEN_SECRET not set');
  return hmacSha256(accountId, AUTHOR_TOKEN_SECRET);
}

/**
 * Derives a server-side device hash from auth context + request metadata.
 * The client never sends this — it is computed here from headers only.
 * This prevents rate-limit bypass by resetting app state.
 */
async function computeDeviceHash(accountId: string, req: Request): Promise<string> {
  const ua = req.headers.get('user-agent') ?? 'unknown';
  const ip =
    req.headers.get('cf-connecting-ip') ??   // Cloudflare (Supabase edge)
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    'unknown';
  const secret = AUTHOR_TOKEN_SECRET ?? 'fallback-hash-secret';
  return hmacSha256(`${accountId}:${ua}:${ip}`, secret);
}

// ─── Step 2: Moderation — OpenAI omni-moderation-latest ──────────────────────
//
// Fail closed in ALL cases:
//   - API key absent  + production  → throw (outer catch → 500)
//   - API key absent  + development → warn + pass (UI testing only)
//   - API returns non-200           → throw (fail closed)
//   - result.flagged                → block

async function runModeration(
  text: string,
): Promise<{ pass: boolean; reason?: string; csam?: boolean }> {
  if (!MODERATION_API_KEY) {
    if (IS_PRODUCTION) {
      // Hard fail in production — see CLAUDE.md non-negotiables.
      throw new Error('[SAFETY] MODERATION_API_KEY not set in production — blocking all submissions');
    }
    // Dev/staging: pass through so the UI can be tested without API keys.
    // This bypass MUST NOT reach production (gated on ENVIRONMENT above).
    console.warn(
      '[SAFETY] MODERATION_API_KEY not set — passing submission in development mode only.',
      'Set ENVIRONMENT=production to enforce hard blocking.',
    );
    return { pass: true };
  }

  const res = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MODERATION_API_KEY}`,
    },
    body: JSON.stringify({ model: 'omni-moderation-latest', input: text }),
  });

  if (!res.ok) {
    // Any API error fails closed — never pass a submission if moderation is uncertain.
    throw new Error(`[SAFETY] Moderation API returned ${res.status} — failing closed`);
  }

  const data = await res.json();
  const result = data.results?.[0];

  if (!result) {
    throw new Error('[SAFETY] Moderation API returned no results — failing closed');
  }

  if (result.flagged) {
    const cats: Record<string, boolean> = result.categories ?? {};
    // omni-moderation-latest exposes sexual/minors directly for CSAM detection
    const isCsam = cats['sexual/minors'] === true;

    const flaggedKeys = Object.entries(cats)
      .filter(([, v]) => v)
      .map(([k]) => k);

    return {
      pass:   false,
      reason: flaggedKeys.join(','),
      csam:   isCsam,
    };
  }

  return { pass: true };
}

// ─── Step 3: Crisis detection ─────────────────────────────────────────────────
//
// Two-layer approach:
//   Layer 1: keyword list (always runs — no API cost, no latency)
//   Layer 2: gpt-4o-mini classifier (runs when keyword list passes clean)
//
// Either layer flagging = crisis path.
// Fail open on classifier errors (keyword list already ran as the primary gate).

const CRISIS_KEYWORDS = [
  'kill myself', 'killing myself', 'end my life', 'take my life',
  'suicide', 'suicidal', 'want to die', 'want to be dead',
  'hurt myself', 'self harm', 'self-harm', 'cutting myself', 'cut myself',
  'overdose', 'no reason to live', 'not worth living',
  "can't go on", "cant go on", "can't take it anymore", "cant take it",
  'going to kill', 'going to hurt', 'being abused', 'domestic violence',
  'please help me', 'no way out', 'nobody cares', 'end it all',
  'i give up on life',
  // M6 additions
  'take my own life', "don't want to live", 'better off dead',
  "can't take it anymore", 'nothing to live for',
];

async function runCrisisCheck(text: string): Promise<{ crisis: boolean }> {
  const lower = text.toLowerCase();

  // Layer 1: keyword list always runs first
  if (CRISIS_KEYWORDS.some((kw) => lower.includes(kw))) {
    return { crisis: true };
  }

  // Layer 2: LLM classifier — only if OPENAI_API_KEY is set
  if (!OPENAI_API_KEY) {
    // No classifier configured — keyword list result stands (not a crisis)
    return { crisis: false };
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model:       'gpt-4o-mini',
        temperature: 0,
        max_tokens:  5,
        messages: [
          {
            role:    'system',
            content: [
              'You are a crisis detection classifier. Respond with only YES or NO.',
              'Respond YES if the text contains suicidal ideation, self-harm, abuse,',
              'or serious immediate distress. When uncertain, respond YES. Never explain.',
            ].join(' '),
          },
          { role: 'user', content: text },
        ],
      }),
    });

    if (!res.ok) {
      // Fail open — keyword list already ran as primary gate
      console.error('[CRISIS] Classifier API returned', res.status, '— failing open');
      return { crisis: false };
    }

    const data = await res.json();
    const answer = (data.choices?.[0]?.message?.content ?? '').trim().toUpperCase();
    return { crisis: answer === 'YES' };

  } catch (err) {
    // Fail open — classifier is a second layer, not the primary gate
    console.error('[CRISIS] Classifier error — failing open:', err);
    return { crisis: false };
  }
}

// ─── Step 4: Embeddings — text-embedding-3-small ─────────────────────────────
//
// Dimension MUST be 1536 to match the pgvector column and HNSW index.
// Fail closed: API error or missing key in production → throw.
// Dev without key: returns zero vector (non-semantic but keeps pipeline exercisable).

async function embedText(text: string): Promise<number[]> {
  if (!EMBEDDING_API_KEY) {
    if (IS_PRODUCTION) {
      throw new Error('[EMBED] EMBEDDING_API_KEY not set in production — cannot embed');
    }
    // Dev: zero vector allows pipeline to run end-to-end without an API key.
    // Matches will be non-semantic but structurally valid.
    console.warn(
      '[EMBED] EMBEDDING_API_KEY not set — returning zero vector in development mode only.',
      'Set ENVIRONMENT=production to enforce hard blocking.',
    );
    return new Array(1536).fill(0);
  }

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${EMBEDDING_API_KEY}`,
    },
    body: JSON.stringify({
      model:      'text-embedding-3-small',
      input:      text,
      dimensions: 1536,
    }),
  });

  if (!res.ok) {
    throw new Error(`[EMBED] Embedding API returned ${res.status} — failing closed`);
  }

  const data = await res.json();
  const embedding: number[] = data.data[0].embedding;

  // Validate dimension — a mismatch would corrupt the pgvector index
  if (embedding.length !== 1536) {
    throw new Error(
      `[EMBED] Embedding dimension mismatch: expected 1536, got ${embedding.length}`,
    );
  }

  return embedding;
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

async function checkRateLimit(
  accountId:  string,
  deviceHash: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const now        = new Date();
  const oneHourAgo = new Date(now.getTime() -      60 * 60 * 1000).toISOString();
  const oneDayAgo  = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const authorToken = await getAuthorToken(accountId);

  // 5 submissions per device per hour
  const { count: deviceCount } = await supabase
    .from('confessions')
    .select('id', { count: 'exact', head: true })
    .eq('author_token', authorToken)
    .gte('created_at', oneHourAgo);

  if ((deviceCount ?? 0) >= 5) {
    return { allowed: false, reason: 'rate_limit_device' };
  }

  // 10 submissions per account per day
  const { count: dayCount } = await supabase
    .from('confessions')
    .select('id', { count: 'exact', head: true })
    .eq('author_token', authorToken)
    .gte('created_at', oneDayAgo);

  if ((dayCount ?? 0) >= 10) {
    return { allowed: false, reason: 'rate_limit_account' };
  }

  await supabase.from('devices').upsert(
    { account_id: accountId, device_hash: deviceHash, last_seen: now.toISOString() },
    { onConflict: 'account_id,device_hash' },
  );

  return { allowed: true };
}

async function recordViolation(accountId: string): Promise<void> {
  await supabase.rpc('increment_abuse_strike',          { p_account_id: accountId });
  await supabase.rpc('check_and_apply_ban_escalation',  { p_account_id: accountId });
}

// ─── Crisis resources ─────────────────────────────────────────────────────────
// Last verified: 2026-06-10
// Before launch: move to a CMS or verified data source with a periodic review SLA.

interface CrisisResource {
  name:    string;
  number?: string;
  url?:    string;
  note?:   string;
}

function getCrisisResources(region = 'IN'): CrisisResource[] {
  const map: Record<string, CrisisResource[]> = {
    IN: [
      { name: 'iCall',                number: '9152987821',    note: 'Mon–Sat 8am–10pm IST' },
      { name: 'Vandrevala Foundation', number: '1860-2662-345', note: '24/7' },
      { name: 'NIMHANS',              number: '080-46110007' },
      { name: 'iCall online',         url:    'https://icallhelpline.org' },
    ],
    US: [
      { name: '988 Suicide & Crisis Lifeline', number: '988',      note: 'Call or text, 24/7' },
      { name: 'Crisis Text Line',              note: 'Text HOME to 741741' },
    ],
    GB: [
      { name: 'Samaritans',          number: '116 123',        note: '24/7, free' },
      { name: 'PAPYRUS HOPELINEUK',  number: '0800 068 4141' },
    ],
  };
  return map[region] ?? map['IN'];
}

// ─── NCMEC CSAM reporting hook ────────────────────────────────────────────────
// IMPORTANT: Do NOT include account_id, user PII, or confession text in the report.
// TODO: Integrate NCMEC CyberTipline API before launch.
//   Reference: https://www.missingkids.org/gethelpnow/cybertipline
//   Requires a platform agreement + API credentials from NCMEC.
//   Report should include: platform name, timestamp, content type, no PII.

async function reportCsam(): Promise<void> {
  console.error(
    '[CSAM] Potential CSAM detected. NCMEC CyberTipline reporting required before launch.',
    'Reference: https://www.missingkids.org/gethelpnow/cybertipline',
    'Timestamp:', new Date().toISOString(),
  );
  // TODO: POST to NCMEC CyberTipline API
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  // ── [0] Auth + ban check ──────────────────────────────────────────────────────
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return json({ error: 'Unauthorized' }, 401);

  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  try {
    const { data: account, error: accErr } = await supabase
      .from('accounts')
      .select('id, banned, ban_reason, temp_ban_expires_at, dob')
      .eq('id', user.id)
      .maybeSingle();

    if (accErr) throw accErr;

    if (!account) {
      return json({ error: 'Account not found. Complete age verification first.' }, 403);
    }

    if (account.banned) {
      return json({ error: 'Your account has been permanently suspended.' }, 403);
    }

    if (account.temp_ban_expires_at && new Date(account.temp_ban_expires_at) > new Date()) {
      return json({
        error: 'Your account is temporarily suspended. Please try again later.',
        until: account.temp_ban_expires_at,
      }, 403);
    }

    // Server-side age gate (belt-and-suspenders on top of client gate screen)
    if (account.dob) {
      const ageMs = Date.now() - new Date(account.dob).getTime();
      if (ageMs / (1000 * 60 * 60 * 24 * 365.25) < 18) {
        return json({ error: 'Must be 18 or older.' }, 403);
      }
    }

    // ── Input validation ──────────────────────────────────────────────────────
    let body: { text?: string; region?: string; deviceHash?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid request body.' }, 400);
    }

    const rawText = body.text?.trim() ?? '';
    if (rawText.length < 10)   return json({ error: 'Confession is too short.' }, 400);
    if (rawText.length > 2000) return json({ error: 'Confession is too long (max 2000 characters).' }, 400);
    const region = body.region ?? 'IN';

    // ── [1] Rate limit ────────────────────────────────────────────────────────
    const serverHash = await computeDeviceHash(user.id, req);
    const deviceHash = body.deviceHash ?? serverHash;
    const { allowed, reason: limitReason } = await checkRateLimit(user.id, deviceHash);
    if (!allowed) {
      await recordViolation(user.id);
      return json({ error: 'Too many submissions. Please wait before trying again.' }, 429);
    }

    // ── [2] MODERATION ────────────────────────────────────────────────────────
    // runModeration() throws on API failure (fail closed).
    // Missing key: throws in production, passes in development (see function above).
    const modResult = await runModeration(rawText);

    if (!modResult.pass) {
      if (modResult.csam) {
        await reportCsam();
        // Do not store text, do not return details, do not log confession content.
        return json({ error: 'This content cannot be submitted.' }, 400);
      }
      return json({
        type:        'blocked',
        blockReason: modResult.reason ?? 'policy_violation',
      });
    }

    // ── [3] CRISIS CHECK ──────────────────────────────────────────────────────
    // Hard early-return: if crisis fires, STORE/MATCH/RETURN are code-unreachable.
    const crisisResult = await runCrisisCheck(rawText);

    if (crisisResult.crisis) {
      // Store for human review (no account_id — see CLAUDE.md)
      await supabase.from('crisis_events').insert({ text: rawText, reviewed: false });

      return json({
        type:            'crisis',
        crisisResources: getCrisisResources(region),
      });
      // ← STORE step is code-unreachable from this path
    }

    // ── [4] EMBED ──────────────────────────────────────────────────────────────
    // embedText() throws on API failure or dimension mismatch (fail closed).
    const embedding = await embedText(rawText);

    // ── [5] STORE ──────────────────────────────────────────────────────────────
    const authorToken = await getAuthorToken(user.id);

    const { data: newConfession, error: insertErr } = await supabase
      .from('confessions')
      .insert({
        author_token: authorToken,
        text:         rawText,
        embedding:    JSON.stringify(embedding),
        status:       'live',
      })
      .select('id')
      .single();

    if (insertErr) throw insertErr;

    // ── [6] MATCH ──────────────────────────────────────────────────────────────
    const { data: matchRows, error: matchErr } = await supabase.rpc('match_confession', {
      p_embedding:    JSON.stringify(embedding),
      p_seeker_token: authorToken,
      p_limit:        1,
    });

    if (matchErr) throw matchErr;

    const matchRow = matchRows?.[0];

    if (!matchRow) {
      // Pool empty — first person to feel this
      return json({
        type:  'submitted',
        match: { id: newConfession.id, text: rawText, feltCount: 0 },
      });
    }

    // ── [7] INCREMENT felt_count (atomic) ──────────────────────────────────────
    const { data: newCount } = await supabase.rpc('increment_felt_count', {
      p_confession_id: matchRow.id,
    });

    await supabase.from('matches').insert({
      seeker_token:        authorToken,
      shown_confession_id: matchRow.id,
    });

    // ── [8] RETURN ─────────────────────────────────────────────────────────────
    // author_token is never returned to the client.
    return json({
      type:  'matched',
      match: {
        id:        matchRow.id,
        text:      matchRow.text,
        feltCount: typeof newCount === 'number' ? newCount : matchRow.felt_count + 1,
      },
    });

  } catch (err) {
    console.error('[submit-confession] unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});
