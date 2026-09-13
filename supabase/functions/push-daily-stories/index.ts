/**
 * Edge Function: push-daily-stories
 *
 * Adds per_category confessions per day per category.
 * Called by a scheduled cron job (service_role only).
 *
 * Control:
 *   UPDATE seed_config SET enabled = false WHERE id = 1;   -- stop instantly
 *   DELETE FROM confessions WHERE author_token = <auto>;   -- retire all
 *
 * Safety: every generated line passes moderation + crisis check before insert.
 * Logs counts only — never confession text.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AUTHOR_TOKEN_SECRET  = Deno.env.get('AUTHOR_TOKEN_SECRET')!;
const OPENAI_API_KEY       = Deno.env.get('OPENAI_API_KEY') ?? '';
// || not ??: these are frequently set to the EMPTY STRING rather than unset,
// and ?? only falls back on null/undefined — so '' passes straight through as
// a 'configured' key. That exact trap silently disabled the moderation gate
// for three months (see CLAUDE.md, incident 2026-09-13).
const EMBEDDING_API_KEY    = Deno.env.get('EMBEDDING_API_KEY') || OPENAI_API_KEY;
const MODERATION_API_KEY   = Deno.env.get('MODERATION_API_KEY') || OPENAI_API_KEY;
const SEED_CRON_SECRET     = Deno.env.get('SEED_CRON_SECRET') ?? '';

/** Constant-time string compare — this endpoint is public and unauthenticated
 *  callers should learn nothing from how long the rejection takes. */
function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CATEGORIES = [
  'mental_health', 'relationships', 'grief',
  'secrets', 'work_identity', 'body_health', 'faith_meaning',
] as const;

type Category = typeof CATEGORIES[number];

const LANG_LABELS: Record<string, string> = {
  en:        'English',
  hi:        'Hindi (Devanagari script)',
  'hi-Latn': 'romanized Hindi using Roman/Latin script (Hinglish)',
  te:        'Telugu (Telugu script)',
  'te-Latn': 'romanized Telugu using Roman/Latin script',
  ta:        'Tamil (Tamil script)',
  bn:        'Bengali (Bengali script)',
};

// ── HMAC ──────────────────────────────────────────────────────────────────────

async function hmacSha256(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Deterministic token for all auto content — retirement handle.
// "soulyap:auto" prefix makes it structurally distinct from real HMAC(account_id, …).
async function getAutoToken(): Promise<string> {
  return hmacSha256('soulyap:auto', AUTHOR_TOKEN_SECRET);
}

// ── Generation ────────────────────────────────────────────────────────────────

const HINTS: Record<Category, string> = {
  mental_health: 'anxiety, depression, numbness, therapy struggles, emotional exhaustion, feeling broken without a visible reason',
  relationships:  'family tension, friendships fading, loneliness in a crowd, loving someone difficult, feeling unseen by the people closest to you',
  grief:          'loss of a person, a relationship, a version of yourself, a dream that died, an animal, something you never got to say',
  secrets:        'things you never told anyone, small betrayals, quiet guilt, things you did or chose not to do, the weight of keeping them',
  work_identity:  'career anxiety, imposter syndrome, not knowing what you want, the gap between the life you have and the one you imagined',
  body_health:    'chronic pain, hating your body, fear about what might be wrong, hiding how bad it is, the exhaustion of managing it quietly',
  faith_meaning:  'questioning beliefs, feeling spiritually lost, searching for meaning after it collapsed, doubting everything without a word for it',
};

async function generateBatch(category: Category, n: number, lang = 'en'): Promise<string[]> {
  if (!OPENAI_API_KEY) return [];

  const langLabel   = LANG_LABELS[lang] ?? 'English';
  const isRomanized = lang.endsWith('-Latn');
  const langLine    = lang === 'en'
    ? ''
    : `\nWRITE IN ${langLabel.toUpperCase()}. ${isRomanized ? 'Use Roman/Latin script (transliterated), NOT native script.' : 'Use native script.'} All ${n} confessions must be in this language.\n`;

  // Few-shot anchored on two confessions from the curated pool. Testing showed
  // instructions alone don't hold the register: gpt-4o-mini returned "your laugh
  // sounded just like the wind chimes" and "the silence was so loud" — AI grief
  // poetry with tidy closers — even with those exact patterns banned in prose.
  // Showing two examples plus an explicit banned list is what made it stick.
  const EXAMPLE_A =
    "I have a whole routine for seeming fine. Shower, coffee, the specific playlist, the walk to the station where I practise my face.\n\n" +
    "By the time I get to my desk I've already done a full day of work, and none of it was the job.\n\n" +
    "I don't know how to tell anyone that the tiredness isn't from the work. It's from the performance around the work.";
  const EXAMPLE_B =
    "my therapist asked what i do for fun and i sat there for a full minute i used to draw. i used to be the person who drew on everything — margins, napkins, my own hands. i don't know when i stopped. there wasn't a day i decided to.\n\n" +
    "i bought a sketchbook last week. it's still in the bag. but i bought it.";

  const prompt = [
    'You write raw, anonymous confessions for an app. Match the register of these exactly.',
    '',
    'EXAMPLE A:', EXAMPLE_A, '',
    'EXAMPLE B:', EXAMPLE_B, '',
    'Why they work: ordinary concrete nouns (playlist, station, sketchbook, margins).',
    'No metaphor. No simile. The feeling is never named — it is shown by what the',
    'person does. They stop mid-thought rather than concluding.',
    langLine,
    `Category: ${category} — ${HINTS[category]}`,
    '',
    'BANNED. Reject your own draft if it contains any of these:',
    '- Simile or metaphor of any kind ("like shadows", "an empty room", "the weight of").',
    '- Weather, seasons, gardens, leaves, or nature standing in for mood.',
    '- A closing line that summarises the feeling or reaches for meaning.',
    '- Naming the emotion: lonely, heartbroken, empty, devastated, palpable, grief itself.',
    '- The phrases "I find myself", "I wonder if", "I realized", "it feels like",',
    '  "no one tells you", "learn to live with".',
    '- Any sentence that could appear in a greetings card.',
    '',
    'FORMAT (mandatory): 2-4 paragraphs separated by ONE BLANK LINE. A confession',
    'with no blank line is invalid. Vary the paragraph count across the batch.',
    '40-120 words each.',
    '',
    lang === 'en' ? [
      'VOICE — assign a different one per confession, never blended:',
      '  1. early 20s: all lowercase, loose punctuation, sentences run together.',
      '  2. 30s-40s: normal capitalisation, plain reflective prose, dry.',
      '  3. 50s+: measured, complete sentences, faintly formal. No slang, no emoji.',
      '',
      'At most one emoji across the whole batch, and only if it genuinely fits.',
    ].join('\n') : 'Keep the voice natural and personal for the target language.',
    '',
    'No names, usernames, places, or employers. NEVER write crisis content:',
    'no suicide, no self-harm, no "want to die" or similar.',
    'Do not reuse an image or structure from earlier in this batch.',
    '',
    `Return ONLY a JSON array of exactly ${n} strings. No markdown, no keys.`,
  ].join('\n');

  const userMsg = lang === 'en'
    ? `Generate ${n} confessions for the "${category}" category.`
    : `Generate ${n} confessions for the "${category}" category in ${langLabel}.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      // gpt-4o, not -mini: tested side by side on the same prompt, -mini
      // ignored the paragraph format and produced sentimental filler.
      // ~$1.20/month at 35 confessions/day.
      model:       'gpt-4o',
      temperature: 1.0,
      // Sized for the long-form shape: ~120 words x n, plus JSON overhead.
      // Was 1400, set when these were 1-3 sentences — too tight now, and a
      // truncated response fails JSON.parse and silently drops the batch.
      max_tokens:  400 * n + 600,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user',   content: userMsg },
      ],
    }),
  });

  if (!res.ok) {
    console.error(`[GEN] LLM ${res.status} for ${category}`);
    return [];
  }

  const data = await res.json();
  const raw  = (data.choices?.[0]?.message?.content ?? '').trim();

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return (parsed as unknown[])
        .filter((s): s is string => typeof s === 'string' && s.trim().length >= 15)
        .map(s => s.trim());
    }
  } catch {
    // Sometimes gpt-4o-mini wraps in markdown fences — strip them
    const stripped = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    try {
      const parsed = JSON.parse(stripped);
      if (Array.isArray(parsed)) {
        return (parsed as unknown[])
          .filter((s): s is string => typeof s === 'string' && s.trim().length >= 15)
          .map(s => s.trim());
      }
    } catch { /* fall through */ }
    console.error(`[GEN] parse error for ${category}:`, raw.slice(0, 120));
  }
  return [];
}

// ── Safety ────────────────────────────────────────────────────────────────────
// Same gates as submit-confession — auto content is not exempt from safety.

const CRISIS_KEYWORDS = [
  'kill myself', 'killing myself', 'end my life', 'take my life',
  'suicide', 'suicidal', 'want to die', 'want to be dead',
  'hurt myself', 'self harm', 'self-harm', 'cutting myself',
  'overdose', 'no reason to live', 'not worth living',
  "can't go on", "cant go on", 'end it all', 'better off dead',
  'take my own life', "don't want to live", 'nothing to live for',
];

function hasCrisis(text: string): boolean {
  const lower = text.toLowerCase();
  return CRISIS_KEYWORDS.some(kw => lower.includes(kw));
}

async function passesModeration(text: string): Promise<boolean> {
  if (!MODERATION_API_KEY) return false;
  const res = await fetch('https://api.openai.com/v1/moderations', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MODERATION_API_KEY}` },
    body: JSON.stringify({ model: 'omni-moderation-latest', input: text }),
  });
  if (!res.ok) return false; // fail closed
  const data = await res.json();
  return !(data.results?.[0]?.flagged ?? true);
}

// ── Embed ─────────────────────────────────────────────────────────────────────

async function embed(text: string): Promise<number[] | null> {
  if (!EMBEDDING_API_KEY) return null;
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${EMBEDDING_API_KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text, dimensions: 1536 }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const emb: number[] = data.data?.[0]?.embedding;
  return emb?.length === 1536 ? emb : null;
}

// ── Dedup ─────────────────────────────────────────────────────────────────────

async function isDuplicate(embedding: number[]): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_confession_duplicate', {
    p_embedding: JSON.stringify(embedding) as any,
    p_threshold: 0.9,
  });
  if (error) {
    console.error('[DEDUP] RPC error:', error.message);
    return false; // fail open — a near-duplicate is better than dropping a good story
  }
  return data === true;
}

// ── Handler ───────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });

  // Cron-only. Accepts either:
  //   - SEED_CRON_SECRET: a narrow, single-purpose token for the scheduler.
  //     The GitHub Actions schedule uses this, so CI holds a secret that can
  //     ONLY trigger seeding — not a service role key, which would grant the
  //     scheduler full database access it has no need for.
  //   - the service role key: for the in-database pg_cron path, which already
  //     runs with that privilege.
  //
  // Compared with a length-equalised constant-time check: a plain !== leaks
  // the position of the first differing byte through timing, and this endpoint
  // is public.
  // The Authorization header is spoken for: Supabase's gateway verifies a JWT
  // there BEFORE this function runs, so a non-JWT secret sent that way is
  // rejected upstream and this code never executes. Disabling that gateway
  // check to make room would weaken every request to this endpoint, so the
  // caller instead sends the public anon JWT as Authorization (satisfying the
  // gateway, which is what it is for) and the real credential in its own
  // header, checked here.
  const provided = req.headers.get('x-seed-secret')
    ?? (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const accepted = [SEED_CRON_SECRET, SUPABASE_SERVICE_KEY].filter(Boolean) as string[];
  if (!accepted.some(k => timingSafeEqual(provided, k))) {
    return respond({ error: 'Unauthorized' }, 401);
  }

  // Optional { category } narrows this invocation to one category, so the
  // caller can fan out across several short runs instead of one long one.
  // Generating all 7 categories in a single invocation exceeded Supabase's
  // per-invocation compute (546 WORKER_RESOURCE_LIMIT) once generation moved
  // to gpt-4o with moderation + crisis + embedding per confession.
  let onlyCategory: Category | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    const c = (body as { category?: string })?.category;
    if (c && (CATEGORIES as readonly string[]).includes(c)) onlyCategory = c as Category;
  } catch { /* no body is fine — run every category */ }

  // 1. Idempotency — skip if today's run is already logged ─────────────────────
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD UTC

  // Per-category when fanning out: a single run_date row would let the first
  // category claim the day and silently skip the other six.
  const runKey = onlyCategory ? `${today}:${onlyCategory}` : today;

  const { data: existingRun } = await supabase
    .from('seed_runs')
    .select('id')
    .eq('run_date', runKey)
    .maybeSingle();

  if (existingRun) {
    console.log('[PUSH] already ran today — skipping');
    return respond({ skipped: true, reason: 'already_ran_today', date: today });
  }

  // 2. Load config ──────────────────────────────────────────────────────────────
  const { data: config, error: cfgErr } = await supabase
    .from('seed_config')
    .select('enabled, per_category, languages')
    .eq('id', 1)
    .maybeSingle();

  if (cfgErr || !config) {
    return respond({ error: 'seed_config unavailable', detail: cfgErr?.message }, 500);
  }
  if (!config.enabled) {
    console.log('[PUSH] seed_config.enabled = false — skipping');
    return respond({ skipped: true, reason: 'disabled' });
  }

  const perCategory: number = config.per_category ?? 5;
  const languages: string[] = config.languages ?? ['en'];
  const autoToken = await getAutoToken();

  // 3. Per-language × per-category loop ─────────────────────────────────────────
  const summary: Record<string, { attempted: number; inserted: number }> = {};

  for (const lang of languages) {
    for (const category of (onlyCategory ? [onlyCategory] : CATEGORIES)) {
      const key      = `${lang}/${category}`;
      let inserted  = 0;
      let attempted = 0;

      // Generate a small buffer over target to absorb safety drops
      const candidates = await generateBatch(category, perCategory + 3, lang);

      for (const text of candidates) {
        if (inserted >= perCategory) break;
        attempted++;

        // [A] Crisis gate
        if (hasCrisis(text)) {
          console.log(`[SAFETY] crisis drop — ${key}`);
          continue;
        }

        // [B] Moderation gate
        if (!(await passesModeration(text))) {
          console.log(`[SAFETY] moderation drop — ${key}`);
          continue;
        }

        // [C] Embed — best-effort. Matching runs on category now, so a missing
        // embedding is not a reason to throw away a safety-cleared confession.
        // This previously dropped EVERY candidate whenever the embedding key was
        // absent: the run reported ok:true with attempted:8, inserted:0, and the
        // scheduler went green while writing nothing.
        const embedding = await embed(text);

        // [D] Dedup — only possible when we have a vector to compare.
        if (embedding && await isDuplicate(embedding)) {
          console.log(`[DEDUP] near-duplicate drop — ${key}`);
          continue;
        }

        // [E] Insert
        const feltCount = Math.floor(Math.random() * 271) + 30;

        const { error: insertErr } = await supabase.from('confessions').insert({
          author_token:           autoToken,
          text,
          embedding:              embedding ? JSON.stringify(embedding) : null,
          categories:             [category],
          status:                 'live',
          amplification_eligible: true,
          authorship_flags:       [],
          source:                 'generated',
          felt_count:             feltCount,
          lang,
        });

        if (insertErr) {
          console.error(`[INSERT] error — ${key}:`, insertErr.message);
          continue;
        }

        inserted++;
      }

      // Log counts only — never confession text
      summary[key] = { attempted, inserted };
      console.log(`[PUSH] ${key}: attempted=${attempted} inserted=${inserted}`);
    }
  }

  const totalInserted = Object.values(summary).reduce((s, r) => s + r.inserted, 0);
  console.log(`[PUSH] done. total=${totalInserted} languages=${languages.join(',')}`);

  // 4. Log this run for idempotency ─────────────────────────────────────────────
  const { error: runErr } = await supabase.from('seed_runs').insert({
    run_date:    runKey,
    total:       totalInserted,
    summary,
  });
  if (runErr) console.error('[PUSH] seed_runs insert failed:', runErr.message);

  return respond({ ok: true, total: totalInserted, summary, date: today });
});
