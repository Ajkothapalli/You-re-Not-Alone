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
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';
import { verifyJwt } from '../_shared/auth.ts';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AUTHOR_TOKEN_SECRET  = Deno.env.get('AUTHOR_TOKEN_SECRET');

const CANDIDATE_N  = 200;
// Owner decision 2026-09-13: the feed is however much we have for the
// reader's categories, not a fixed 10. This is still a BOUND, not infinity —
// it is the size of one response, the candidate pool above is finite, and
// nothing loads on scroll. What changed is that a reader with 40 matching
// confessions now sees 40 rather than being cut to 10 for no reason they
// could perceive.
const RETURN_N     = CANDIDATE_N;
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
  /** Non-null on voice confessions. The object KEY is never selected. */
  audio_duration_ms: number | null;
  audio_waveform: number[] | null;
  // 'user' | 'generated' | 'seed'. Drives the authenticity bonus in score():
  // real confessions outrank AI ones so generated content recedes on its own
  // as real volume arrives. Optional because older rows may predate the column.
  source?:    string | null;
  /** [W2] Set when this confession answers a weekly question. */
  question_id?: string | null;
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

  // Real confessions outrank generated ones (owner decision 2026-09-13).
  // AI stories exist to keep the feed from being empty before real volume
  // arrives; as real confessions land they should displace them on their own,
  // with no cutover to run and no category suddenly going thin. A flat bonus
  // rather than a filter, so a thin category still fills rather than starves.
  const authenticity = c.source === 'user' ? 0.25 : 0;

  if (coldStart) {
    // Cold start: lean on popularity × recency + diversity boost
    return 0.45 * popularity * recency + 0.35 * similarity + 0.2 * starvation + authenticity;
  }

  return (
    0.50 * similarity +
    0.15 * popularity * recency +
    0.10 * starvation -
    0.10 * fatigueScore +
    authenticity
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

/**
 * Strip internal scoring fields before returning — never distance or score,
 * never the audio storage key (CLAUDE.md invariant 3), never account_id.
 * Shared by the ordinary feed and the question filter so the two cannot drift.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toClient(c: Candidate) {
  return {
    id:         c.id,
    text:       c.text,
    feltCount:  c.felt_count,
    categories: c.categories,
    ...(c.audio_duration_ms ? { audioDurationMs: c.audio_duration_ms } : {}),
    ...(c.audio_waveform?.length ? { audioWaveform: c.audio_waveform } : {}),
    // Lets the feed label an answer "Answering: <question>" wherever it
    // appears — inside the filter or in its ordinary category.
    ...(c.question_id ? { questionId: c.question_id } : {}),
  };
}

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

  const user = await verifyJwt(supabase, jwt);
  if (!user) return json({ error: 'Unauthorized' }, 401);

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
  //
  // Accepts a BATCH. The client queues signals and flushes them together
  // rather than opening a round trip per card while the feed scrolls.
  //
  // The single-signal shape is still accepted, and must stay that way: an app
  // version older than this function is a normal state of the world (OTA and
  // store rollouts are never simultaneous), and dropping its signals would
  // silently degrade recommendations for everyone who had not updated.
  if (action === 'signal') {
    const VALID_SIGNALS: SignalType[] = [
      'impression', 'read_to_end', 'felt', 'share', 'skip', 'report',
    ];
    const UUID_RE_SIG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const MAX_BATCH = 100;

    // Old shape first, so an old client is never mis-parsed as an empty batch.
    const incoming: unknown[] = Array.isArray(body.signals)
      ? body.signals
      : [{ confessionId: body.confessionId, signal: body.signal }];

    if (incoming.length === 0) return json({ ok: true, stored: 0 });
    // Rejected, not truncated: silently dropping the tail would make the
    // client think signals landed when they did not.
    if (incoming.length > MAX_BATCH) {
      return json({ error: 'Too many signals.' }, 400);
    }

    const rows: { reader_account_id: string; confession_id: string; signal: SignalType }[] = [];
    const seen = new Set<string>();

    for (const raw of incoming) {
      const e = raw as { confessionId?: unknown; signal?: unknown };
      const id  = typeof e?.confessionId === 'string' ? e.confessionId : '';
      const sig = e?.signal as SignalType;
      // Every entry is validated on its own. One bad entry must not take a
      // whole batch of good signals down with it.
      if (!UUID_RE_SIG.test(id) || !VALID_SIGNALS.includes(sig)) continue;

      const key = `${id}:${sig}`;
      if (seen.has(key)) continue;          // a card scrolled past twice
      seen.add(key);
      rows.push({ reader_account_id: user.id, confession_id: id, signal: sig });
    }

    if (rows.length === 0) return json({ error: 'Invalid signal payload.' }, 400);

    // ONE insert for the whole batch.
    await supabase.from('read_events').insert(rows);

    // Taste is still updated per engagement signal — the RPC is per
    // confession and encodes what the reader responded to, so batching the
    // insert must not collapse it into a single call.
    const TASTE_SIGNALS: SignalType[] = ['felt', 'read_to_end', 'share', 'report', 'skip'];
    for (const r of rows) {
      if (!TASTE_SIGNALS.includes(r.signal)) continue;
      supabase.rpc('update_reader_taste', {
        p_reader_id:     user.id,
        p_confession_id: r.confession_id,
        p_signal:        r.signal,
      }).then(({ error }) => {
        if (error) console.error('[signal] update_reader_taste error:', error.message);
      });
    }

    return json({ ok: true, stored: rows.length });
  }

  // ── Recommend ─────────────────────────────────────────────────────────────────
  if (action !== 'recommend') return json({ error: 'Unknown action.' }, 400);

  if (!AUTHOR_TOKEN_SECRET) {
    console.error('[recommend] AUTHOR_TOKEN_SECRET not set');
    return json({ error: 'Service unavailable.' }, 503);
  }

  // Reading is NOT gated (owner decision 2026-09-13, restoring CLAUDE.md §6:
  // "Plans NEVER gate matching, reading, writing, or the counter itself —
  // supporting buys nothing another user is denied").
  //
  // This used to return an empty set to every non-premium reader, so a free
  // user saw no real confession ever — only the client's preview pool, and
  // only for their first 30 days. After that the feed went permanently empty
  // behind copy that said "come back soon, more are arriving". That is the
  // opposite of the one rule this surface has: the feed is never empty.
  //
  // is_premium still exists and the revenuecat-webhook still writes it; it is
  // simply not a reading entitlement. Whatever supporting buys, it is not
  // access to other people's words.

  /**
   * Preferences, the author token and the cold-start check, together.
   *
   * These were three sequential round trips and none of them is an input to
   * another — the feed simply waited out all three before it could ask for a
   * single confession.
   *
   * The cold-start check also stops COUNTING. It only ever asked "are there
   * at least 5?", but `count: 'exact'` makes Postgres tally every engagement
   * row the reader has ever produced — work that grows without limit for
   * exactly the readers who use the app most, to answer a question that is
   * settled after the fifth row. LIMIT 5 answers it in constant time.
   */
  const [prefsRes, authorToken, engagementRes] = await Promise.all([
    supabase
      .from('reader_preferences')
      .select('categories, sexual_opt_in, taste_embedding')
      .eq('account_id', user.id)
      .maybeSingle(),
    hmacSha256(user.id, AUTHOR_TOKEN_SECRET),
    supabase
      .from('read_events')
      .select('id')
      .eq('reader_account_id', user.id)
      .in('signal', ['felt', 'read_to_end', 'share'])
      .limit(5),
  ]);

  const prefs         = prefsRes.data;
  const categories    = (prefs?.categories   as string[]) ?? [];
  const sexualOptIn   = (prefs?.sexual_opt_in as boolean) ?? false;
  const tasteRaw      = prefs?.taste_embedding as string | null;

  const coldStart = (engagementRes.data?.length ?? 0) < 5;

  /**
   * [W2] Optional weekly-question filter.
   *
   * Validated for SHAPE only; the RPC decides what it matches. The filter is
   * ANDed onto the same WHERE clause as every safety filter, so it can only
   * narrow the safe set — there is no path where an answer skips a check a
   * normal feed card would face.
   */
  const questionId =
    typeof body.questionId === 'string' && UUID_RE.test(body.questionId)
      ? body.questionId
      : null;

  // 4. Candidate generation via RPC (safety filters applied here — before scoring)
  const { data: candidates, error: rpcError } = await supabase.rpc('recommend_confessions', {
    p_reader_id:       user.id,
    p_author_token:    authorToken,
    p_taste_embedding: tasteRaw ?? null,
    p_categories:      categories.length > 0 ? categories : null,
    p_sexual_opt_in:   sexualOptIn,
    p_limit:           CANDIDATE_N,
    p_question_id:     questionId,
  });

  if (rpcError) {
    console.error('[recommend] RPC error:', rpcError.message);
    return json({ error: 'Could not fetch recommendations.' }, 500);
  }

  if (!candidates || candidates.length === 0) {
    return json({ confessions: [] });
  }

  /**
   * Under the question filter the RPC's order IS the answer: newest first,
   * real answers only. Re-ranking would reorder them by taste, and diversity
   * selection would drop answers to spread categories — both wrong for a list
   * that ends with "That's every answer so far". No generated fill either:
   * the RPC already excludes it, and topping up here would put fabricated
   * answers under a question real people answered.
   */
  if (questionId) {
    return json({
      confessions: (candidates as Candidate[]).map(toClient),
    });
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

  return json({ confessions: diverse.map(toClient) });
});
