/**
 * Edge Function: edit-confession
 *
 * Allows the owning user to update their confession text while it is still
 * editable (real_felt_count = 0, i.e. no real user has felt it yet).
 * Generated companions (source='generated') and seeds (source='seed') never seal.
 *
 * Pipeline (non-bypassable — see CLAUDE.md):
 *   [0] Auth + ban check
 *   [1] Verify ownership (account_id = auth.uid() OR legacy author_token)
 *   [2] Fast-path seal check — skip expensive safety gate if already sealed
 *   [3] MODERATION gate   (same as submit-confession — fail closed in production)
 *   [4] CRISIS check      (same as submit-confession — keyword list + gpt-4o-mini)
 *   [5] EMBED             (text-embedding-3-small, 1536 dims)
 *   [6] CATEGORIZE        (gpt-4o-mini, fixed taxonomy)
 *   [7] ATOMIC UPDATE with real_felt_count = 0 guard
 *   [8] Return
 *
 * Response shapes (never include account_id, real_felt_count, author_token, source):
 *   { sealed: true }                     — already sealed or race
 *   { blocked: true, reason: string }    — moderation / crisis rejected new text
 *   { success: true, confession: {...} } — saved; reflect new state
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MODERATION_API_KEY   = Deno.env.get('MODERATION_API_KEY');
const OPENAI_API_KEY       = Deno.env.get('OPENAI_API_KEY');
const EMBEDDING_API_KEY    = Deno.env.get('EMBEDDING_API_KEY');
const ENVIRONMENT          = Deno.env.get('ENVIRONMENT') ?? 'development';
const AUTHOR_TOKEN_SECRET  = Deno.env.get('AUTHOR_TOKEN_SECRET');

async function hmacSha256(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const IS_PRODUCTION = ENVIRONMENT === 'production';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SEC = {
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control':          'no-store',
  'Referrer-Policy':        'same-origin',
};

// ─── Step [3]: Moderation — identical to submit-confession ───────────────────

async function runModeration(
  text: string,
): Promise<{ pass: boolean; reason?: string; adultSignal?: boolean }> {
  if (!MODERATION_API_KEY) {
    // Fail closed in every environment — see submit-confession for the full
    // reasoning. This path matters even more than submission: an edit that
    // skips moderation is a complete circumvention of the submit gate. Post
    // something benign, edit it to anything, and it is live and matched with
    // no classifier having ever seen the final text.
    throw new Error(
      '[SAFETY] MODERATION_API_KEY not set — blocking all edits. ' +
      'Intentional in every environment: set a real key to accept edits.',
    );
  }

  const res = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MODERATION_API_KEY}` },
    body: JSON.stringify({ model: 'omni-moderation-latest', input: text }),
  });

  if (!res.ok) {
    throw new Error(`[SAFETY] Moderation API returned ${res.status} — failing closed`);
  }

  const data   = await res.json();
  const result = data.results?.[0];
  if (!result) throw new Error('[SAFETY] Moderation API returned no results — failing closed');

  if (result.flagged) {
    const cats: Record<string, boolean> = result.categories ?? {};
    const flaggedKeys = Object.entries(cats).filter(([, v]) => v).map(([k]) => k);
    return { pass: false, reason: flaggedKeys.join(',') };
  }

  const scores: Record<string, number> = result.category_scores ?? {};
  const adultSignal = (scores['sexual'] ?? 0) > 0.3;
  return { pass: true, adultSignal };
}

// ─── Step [4]: Crisis detection — identical to submit-confession ─────────────

const CRISIS_KEYWORDS = [
  'kill myself', 'killing myself', 'end my life', 'take my life',
  'suicide', 'suicidal', 'want to die', 'want to be dead',
  'hurt myself', 'self harm', 'self-harm', 'cutting myself', 'cut myself',
  'overdose', 'no reason to live', 'not worth living',
  "can't go on", "cant go on", "can't take it anymore", "cant take it",
  'going to kill', 'going to hurt', 'being abused', 'domestic violence',
  'please help me', 'no way out', 'nobody cares', 'end it all',
  'i give up on life', 'take my own life', "don't want to live",
  'better off dead', 'nothing to live for',
];

async function runCrisisCheck(text: string): Promise<{ crisis: boolean }> {
  const lower = text.toLowerCase();
  if (CRISIS_KEYWORDS.some((kw) => lower.includes(kw))) return { crisis: true };

  if (!OPENAI_API_KEY) return { crisis: false };

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini', temperature: 0, max_tokens: 5,
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
    if (!res.ok) { console.error('[CRISIS] Classifier API returned', res.status); return { crisis: false }; }
    const data   = await res.json();
    const answer = (data.choices?.[0]?.message?.content ?? '').trim().toUpperCase();
    return { crisis: answer === 'YES' };
  } catch (err) {
    console.error('[CRISIS] Classifier error — failing open:', err);
    return { crisis: false };
  }
}

// ─── Step [5]: Embeddings — identical to submit-confession ───────────────────

async function embedText(text: string): Promise<number[]> {
  if (!EMBEDDING_API_KEY) {
    if (IS_PRODUCTION) throw new Error('[EMBED] EMBEDDING_API_KEY not set in production');
    console.warn('[EMBED] EMBEDDING_API_KEY not set — returning zero vector (dev only).');
    return new Array(1536).fill(0);
  }

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${EMBEDDING_API_KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text, dimensions: 1536 }),
  });
  if (!res.ok) throw new Error(`[EMBED] Embedding API returned ${res.status} — failing closed`);

  const data: { data: { embedding: number[] }[] } = await res.json();
  const embedding = data.data[0].embedding;
  if (embedding.length !== 1536) {
    throw new Error(`[EMBED] Dimension mismatch: expected 1536, got ${embedding.length}`);
  }
  return embedding;
}

// ─── Step [6]: Category classification — identical to submit-confession ───────

const CLASSIFIER_TAXONOMY = [
  'mental_health', 'relationships', 'grief',
  'secrets', 'work_identity', 'body_health', 'faith_meaning',
] as const;

async function classifyCategories(text: string, adultSignal: boolean): Promise<string[]> {
  const categories: string[] = [];
  if (adultSignal) categories.push('sexuality_intimacy');

  if (!OPENAI_API_KEY) return categories;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini', temperature: 0, max_tokens: 40,
        messages: [
          {
            role:    'system',
            content: [
              'Classify this personal confession into 1–3 categories.',
              `Choose ONLY from: ${CLASSIFIER_TAXONOMY.join(', ')}.`,
              'Respond with ONLY a JSON array of strings. No explanation.',
            ].join(' '),
          },
          { role: 'user', content: text },
        ],
      }),
    });
    if (!res.ok) { console.warn('[CATEGORIZE] API returned', res.status); return categories; }

    const data   = await res.json();
    const raw    = (data.choices?.[0]?.message?.content ?? '').trim();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const valid = (parsed as string[])
        .filter(c => (CLASSIFIER_TAXONOMY as readonly string[]).includes(c))
        .slice(0, 3);
      categories.push(...valid);
    }
  } catch (err) {
    console.warn('[CATEGORIZE] Error — failing open:', err);
  }

  return [...new Set(categories)];
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, ...SEC, 'Content-Type': 'application/json' },
    });

  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const contentLength = parseInt(req.headers.get('content-length') ?? '0', 10);
  if (contentLength > 32_768) return json({ error: 'Request too large.' }, 413);

  // ── [0] Auth + ban check ─────────────────────────────────────────────────────
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return json({ error: 'Unauthorized.' }, 401);

  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) return json({ error: 'Unauthorized.' }, 401);

  try {
    const { data: account, error: accErr } = await supabase
      .from('accounts')
      .select('id, banned, temp_ban_expires_at')
      .eq('id', user.id)
      .maybeSingle();

    if (accErr) throw accErr;
    if (!account) return json({ error: 'Account not found.' }, 403);
    if (account.banned) return json({ error: 'Account suspended.' }, 403);
    if (account.temp_ban_expires_at && new Date(account.temp_ban_expires_at) > new Date()) {
      return json({ error: 'Account temporarily suspended.' }, 403);
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    let body: { id?: string; text?: string };
    try { body = await req.json(); }
    catch { return json({ error: 'Invalid request body.' }, 400); }

    const confessionId = (body.id ?? '').trim();
    const rawText      = (body.text ?? '').trim();

    if (!confessionId)        return json({ error: 'id is required.' }, 400);
    if (rawText.length < 10)  return json({ error: 'Confession is too short.' }, 400);
    if (rawText.length > 2000) return json({ error: 'Confession is too long (max 2000 characters).' }, 400);

    // ── [1] Verify ownership ─────────────────────────────────────────────────
    // Match new rows (account_id) OR legacy rows (author_token, pre-account-linking).
    const legacyToken = AUTHOR_TOKEN_SECRET
      ? await hmacSha256(user.id, AUTHOR_TOKEN_SECRET)
      : null;
    const ownerFilter = legacyToken
      ? `account_id.eq.${user.id},author_token.eq.${legacyToken}`
      : `account_id.eq.${user.id}`;

    const { data: existing, error: findErr } = await supabase
      .from('confessions')
      .select('id, real_felt_count, status')
      .eq('id', confessionId)
      .or(ownerFilter)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!existing) return json({ error: 'Confession not found or not owned by you.' }, 403);

    // ── [2] Fast-path seal check ─────────────────────────────────────────────
    // If already sealed, skip the expensive API calls. Respond immediately.
    if (existing.real_felt_count > 0) return json({ sealed: true });

    // ── [3] Moderation gate ──────────────────────────────────────────────────
    const modResult = await runModeration(rawText);
    if (!modResult.pass) {
      return json({ blocked: true, reason: modResult.reason ?? 'policy_violation' });
    }

    // ── [4] Crisis check ─────────────────────────────────────────────────────
    // Crisis content blocks the edit; original text is untouched.
    // Note: we do NOT store a crisis_event here — this is a deliberate edit,
    // not an original submission. The blocked response routes the user to resources.
    const crisisResult = await runCrisisCheck(rawText);
    if (crisisResult.crisis) {
      return json({ blocked: true, reason: 'crisis' });
    }

    // ── [5] Embed ────────────────────────────────────────────────────────────
    const embedding = await embedText(rawText);

    // ── [6] Categorize ───────────────────────────────────────────────────────
    const categories = await classifyCategories(rawText, modResult.adultSignal ?? false);

    // ── [7] Atomic UPDATE with seal guard ────────────────────────────────────
    // The WHERE real_felt_count = 0 clause is the atomic seal guard.
    // If a real felt landed between step [2] and now, 0 rows are updated.
    // The embedding is stored as a JSON string (pgvector expects this format).
    const { data: updated, error: updateErr } = await supabase
      .from('confessions')
      .update({
        text:       rawText,
        embedding:  JSON.stringify(embedding),
        categories,
        updated_at: new Date().toISOString(),
      })
      .eq('id', confessionId)
      .or(ownerFilter)
      .eq('real_felt_count', 0)
      .select('id, text, felt_count, status, created_at, updated_at')
      .maybeSingle();

    if (updateErr) throw updateErr;

    // 0 rows updated = sealed race (a real felt arrived between our check and this write)
    if (!updated) return json({ sealed: true });

    // ── [8] Return ───────────────────────────────────────────────────────────
    // NEVER return: account_id, real_felt_count, author_token, source.
    return json({
      success:    true,
      confession: {
        id:         updated.id,
        text:       updated.text,
        felt_count: updated.felt_count,
        status:     updated.status,
        created_at: updated.created_at,
        updated_at: updated.updated_at,
        can_edit:   true,  // guard passed — still editable
      },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[edit-confession] unhandled error:', msg);
    return json({ error: 'Internal server error.' }, 500);
  }
});
