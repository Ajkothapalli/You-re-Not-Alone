/**
 * Edge Function: recommend-confessions
 *
 * Two operations dispatched by `action` in the request body:
 *
 *   action = 'recommend'
 *     Returns up to RETURN_N personalized confessions for the authenticated reader.
 *     Pipeline:
 *       1. Read reader_preferences (categories, sexual_opt_in, taste_embedding)
 *       2. Compute author_token (HMAC) to exclude own authored confessions
 *       3. Call recommend_confessions RPC → up to CANDIDATE_N candidates,
 *          already filtered by safety gates
 *       4. Re-rank: content sim + popularity*recency + starvation - fatigue
 *       5. Diversity selection (category spread)
 *       6. ε-greedy exploration (10% random swap)
 *       7. Return top RETURN_N
 *
 *   action = 'signal'
 *     Logs a read_event and updates taste_embedding via update_reader_taste().
 *     Body: { action: 'signal', confessionId: string, signal: SignalType }
 *
 * Safety invariants:
 *   - safety filters in the SQL RPC are applied BEFORE re-ranking (provable)
 *   - sexuality_intimacy content is hard-filtered for non-opted-in readers in SQL
 *   - author_token is computed here and never returned to the client
 *   - reader_account_id never joins to author_token in any persisted table
 */

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AUTHOR_TOKEN_SECRET  = Deno.env.get('AUTHOR_TOKEN_SECRET');

const CANDIDATE_N  = 200;
const RETURN_N     = 10;
const EPSILON      = 0.1;   // exploration rate
const LAMBDA       = 0.7;   // MMR relevance weight
const ALPHA_POS    = 0.15;  // taste EMA — positive signal learning rate
const BETA_NEG     = 0.05;  // taste EMA — negative signal push-away rate

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type SignalType = 'impression' | 'read_to_end' | 'felt' | 'share' | 'skip' | 'report';

interface Candidate {
  id:         string;
  text:       string;
  felt_count: number;
  categories: string[];
  created_at: string;
  distance:   number | null;
}

interface ScoredCandidate extends Candidate {
  score: number;
}

// ─── HMAC ────────────────────────────────────────────────────────────────────

async function hmacSha256(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function scoreCandidate(
  c:            Candidate,
  fatigue:      Map<string, number>,
  coldStart:    boolean,
): number {
  // Cosine distance [0, 2] → similarity [0, 1] (lower distance = more similar)
  const similarity = c.distance != null ? Math.max(0, 1 - c.distance / 2) : 0.5;

  // Recency: half-life 30 days
  const ageDays = (Date.now() - new Date(c.created_at).getTime()) / 86_400_000;
  const recency  = Math.exp(-Math.LN2 * ageDays / 30);

  // Popularity: log-scaled to [0, 1]
  const popularity = Math.log(1 + Math.min(c.felt_count, 10_000)) / Math.log(10_001);

  // Category fatigue: how many from each category we've already served
  const maxFatigue = Math.max(...c.categories.map(cat => fatigue.get(cat) ?? 0), 0);
  const fatigueScore = Math.min(maxFatigue / 5, 1);

  // Starvation boost: at least one of this item's categories hasn't been served yet
  const starvation = c.categories.some(cat => (fatigue.get(cat) ?? 0) === 0) ? 0.1 : 0;

  if (coldStart) {
    // Cold start: lean on popularity × recency + diversity boost
    return 0.45 * popularity * recency + 0.35 * similarity + 0.2 * starvation;
  }

  return (
    0.50 * similarity +
    0.15 * popularity * recency +
    0.10 * starvation -
    0.10 * fatigueScore
  );
}

// ─── Diversity selection (greedy category spread, MMR-style) ─────────────────

function selectWithDiversity(
  scored:  ScoredCandidate[],
  targetN: number,
): ScoredCandidate[] {
  const selected: ScoredCandidate[]  = [];
  const catCounts = new Map<string, number>();
  const remaining = [...scored];

  while (selected.length < targetN && remaining.length > 0) {
    let bestIdx   = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      // Category overlap penalty with already-selected items
      const overlap = c.categories.reduce((s, cat) => s + (catCounts.get(cat) ?? 0), 0)
        / Math.max(c.categories.length, 1);
      const adjustedScore = LAMBDA * c.score - (1 - LAMBDA) * overlap * 0.15;
      if (adjustedScore > bestScore) {
        bestScore = adjustedScore;
        bestIdx   = i;
      }
    }

    const picked = remaining[bestIdx];
    selected.push(picked);
    remaining.splice(bestIdx, 1);
    picked.categories.forEach(cat => catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1));
  }

  return selected;
}

// ─── ε-greedy exploration ─────────────────────────────────────────────────────

function applyExploration(
  scored:  ScoredCandidate[],
  epsilon: number,
): ScoredCandidate[] {
  return scored.map(c => ({
    ...c,
    score: Math.random() < epsilon ? Math.random() * 0.5 + 0.5 : c.score,
  }));
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  // ── Auth ──────────────────────────────────────────────────────────────────────
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return json({ error: 'Unauthorized' }, 401);

  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  // Verify account exists + not banned
  const { data: account } = await supabase
    .from('accounts')
    .select('id, banned, temp_ban_expires_at')
    .eq('id', user.id)
    .maybeSingle();

  if (!account) return json({ error: 'Account not found.' }, 403);
  if (account.banned) return json({ error: 'Account suspended.' }, 403);
  if (account.temp_ban_expires_at && new Date(account.temp_ban_expires_at) > new Date()) {
    return json({ error: 'Account temporarily suspended.' }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const action = body.action as string;

  // ── Signal logging ────────────────────────────────────────────────────────────
  if (action === 'signal') {
    const confessionId = body.confessionId as string;
    const signal       = body.signal       as SignalType;

    const VALID_SIGNALS: SignalType[] = [
      'impression', 'read_to_end', 'felt', 'share', 'skip', 'report',
    ];
    if (!confessionId || !VALID_SIGNALS.includes(signal)) {
      return json({ error: 'Invalid signal payload.' }, 400);
    }

    // Log the read event
    await supabase.from('read_events').insert({
      reader_account_id: user.id,
      confession_id:     confessionId,
      signal,
    });

    // Update taste on engagement signals (fire-and-forget; errors don't block response)
    const TASTE_SIGNALS: SignalType[] = ['felt', 'read_to_end', 'share', 'report', 'skip'];
    if (TASTE_SIGNALS.includes(signal)) {
      supabase.rpc('update_reader_taste', {
        p_reader_id:     user.id,
        p_confession_id: confessionId,
        p_signal:        signal,
      }).then(({ error }) => {
        if (error) console.error('[signal] update_reader_taste error:', error.message);
      });
    }

    return json({ ok: true });
  }

  // ── Recommend ─────────────────────────────────────────────────────────────────
  if (action !== 'recommend') return json({ error: 'Unknown action.' }, 400);

  if (!AUTHOR_TOKEN_SECRET) {
    console.error('[recommend] AUTHOR_TOKEN_SECRET not set');
    return json({ error: 'Service unavailable.' }, 503);
  }

  // Premium gate — unlimited reading is a paid entitlement. The server is the
  // source of truth (written by the revenuecat-webhook), so the paywall can't
  // be bypassed by a tampered client. Free readers get the empty set + a flag;
  // the client shows the upgrade path. Crisis support is never gated.
  const { data: isPremium } = await supabase.rpc('is_premium', { uid: user.id });
  if (!isPremium) {
    return json({ confessions: [], premiumRequired: true });
  }

  // 1. Read preferences (authoritative from DB — never from client)
  const { data: prefs } = await supabase
    .from('reader_preferences')
    .select('categories, sexual_opt_in, taste_embedding')
    .eq('account_id', user.id)
    .maybeSingle();

  const categories    = (prefs?.categories   as string[]) ?? [];
  const sexualOptIn   = (prefs?.sexual_opt_in as boolean) ?? false;
  const tasteRaw      = prefs?.taste_embedding as string | null;

  // 2. Author token (never stored in DB; used only to exclude own confessions in RPC)
  const authorToken = await hmacSha256(user.id, AUTHOR_TOKEN_SECRET);

  // 3. Count engagement events to detect cold start
  const { count: eventCount } = await supabase
    .from('read_events')
    .select('id', { count: 'exact', head: true })
    .eq('reader_account_id', user.id)
    .in('signal', ['felt', 'read_to_end', 'share']);

  const coldStart = (eventCount ?? 0) < 5;

  // 4. Candidate generation via RPC (safety filters applied here — before scoring)
  const { data: candidates, error: rpcError } = await supabase.rpc('recommend_confessions', {
    p_reader_id:       user.id,
    p_author_token:    authorToken,
    p_taste_embedding: tasteRaw ?? null,
    p_categories:      categories.length > 0 ? categories : null,
    p_sexual_opt_in:   sexualOptIn,
    p_limit:           CANDIDATE_N,
  });

  if (rpcError) {
    console.error('[recommend] RPC error:', rpcError.message);
    return json({ error: 'Could not fetch recommendations.' }, 500);
  }

  if (!candidates || candidates.length === 0) {
    return json({ confessions: [] });
  }

  // 5. Re-rank
  const fatigue = new Map<string, number>(); // empty at start of session
  const scored: ScoredCandidate[] = (candidates as Candidate[]).map(c => ({
    ...c,
    score: scoreCandidate(c, fatigue, coldStart),
  }));

  // 6. ε-greedy exploration
  const explored = applyExploration(scored, EPSILON);

  // Sort descending by score
  explored.sort((a, b) => b.score - a.score);

  // 7. Diversity selection (category spread)
  const diverse = selectWithDiversity(explored, RETURN_N);

  // Strip internal scoring fields before returning (never return distance or score)
  const result = diverse.map(({ id, text, felt_count, categories: cats }) => ({
    id,
    text,
    feltCount:  felt_count,
    categories: cats,
  }));

  return json({ confessions: result });
});
