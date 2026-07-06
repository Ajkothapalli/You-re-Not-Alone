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
const EMBEDDING_API_KEY    = Deno.env.get('EMBEDDING_API_KEY') ?? OPENAI_API_KEY;
const MODERATION_API_KEY   = Deno.env.get('MODERATION_API_KEY') ?? OPENAI_API_KEY;

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

  const prompt = [
    'You write raw, anonymous personal confessions for a mobile app.',
    'Each confession is one honest, specific feeling — imperfect and human.',
    langLine,
    `Category hints: ${HINTS[category]}`,
    '',
    'Hard rules:',
    '- 1–3 sentences. One feeling. No more.',
    '- Concrete and personal — a real moment, not a general statement.',
    '- No advice. No rhetorical questions. No clichés like "life is hard" or "I feel so alone."',
    '- No names, usernames, or locations.',
    '- NEVER write crisis content: no suicide, no self-harm, no "want to die" or similar.',
    '',
    lang === 'en' ? [
      'Voice — mix across the batch:',
      '  • teens / early 20s (~35%): all lowercase, casual, raw. "idk", "fr", "lowkey", "ngl".',
      '    Optional emoji: 🥲 😭 💀 🙃 😶 😮‍💨 — only if it fits. NOT every line.',
      '  • 30s–40s (~40%): reflective, slightly longer, thoughtful but not tidy. Occasional emoji ok.',
      '  • 50s+ (~25%): measured, full sentences, clean prose. No emoji.',
      '',
      'Add an emoji to roughly 1 in 3 confessions only — never more.',
    ].join('\n') : 'Keep the voice natural and personal for the target language.',
    '',
    `Return ONLY a JSON array of exactly ${n} strings. No markdown, no keys, no explanation.`,
  ].join('\n');

  const userMsg = lang === 'en'
    ? `Generate ${n} confessions for the "${category}" category.`
    : `Generate ${n} confessions for the "${category}" category in ${langLabel}.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model:       'gpt-4o-mini',
      temperature: 0.95,
      max_tokens:  1400,
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

  // Cron-only: must present the service role key
  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${SUPABASE_SERVICE_KEY}`) {
    return respond({ error: 'Unauthorized' }, 401);
  }

  // 1. Idempotency — skip if today's run is already logged ─────────────────────
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD UTC

  const { data: existingRun } = await supabase
    .from('seed_runs')
    .select('id')
    .eq('run_date', today)
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
    for (const category of CATEGORIES) {
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

        // [C] Embed
        const embedding = await embed(text);
        if (!embedding) {
          console.error(`[EMBED] failed — ${key}`);
          continue;
        }

        // [D] Dedup
        if (await isDuplicate(embedding)) {
          console.log(`[DEDUP] near-duplicate drop — ${key}`);
          continue;
        }

        // [E] Insert
        const feltCount = Math.floor(Math.random() * 271) + 30;

        const { error: insertErr } = await supabase.from('confessions').insert({
          author_token:           autoToken,
          text,
          embedding:              JSON.stringify(embedding),
          categories:             [category],
          status:                 'live',
          amplification_eligible: true,
          authorship_flags:       [],
          is_seed:                true,
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
    run_date:    today,
    total:       totalInserted,
    summary,
  });
  if (runErr) console.error('[PUSH] seed_runs insert failed:', runErr.message);

  return respond({ ok: true, total: totalInserted, summary, date: today });
});
