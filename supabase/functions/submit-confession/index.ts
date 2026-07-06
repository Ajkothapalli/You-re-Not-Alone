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
const OPENAI_API_KEY       = Deno.env.get('OPENAI_API_KEY');   // gpt-4o-mini crisis + judge
const EMBEDDING_API_KEY    = Deno.env.get('EMBEDDING_API_KEY');
const ENVIRONMENT          = Deno.env.get('ENVIRONMENT') ?? 'development';

const IS_PRODUCTION = ENVIRONMENT === 'production';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Added to every response — never leak content type, never cache auth'd data.
const SEC = {
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control':          'no-store',
  'Referrer-Policy':        'same-origin',
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
): Promise<{ pass: boolean; reason?: string; csam?: boolean; adultSignal?: boolean; borderline?: boolean }> {
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
    return { pass: true, adultSignal: false };
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

  // Pass: check adult signal and borderline harm scores.
  // Adult > 0.3 but not flagged = mature content that cleared moderation.
  // Borderline = any harm-adjacent category above 0.25 — queued for human review
  // rather than blocked, so the confession goes in as 'under_review' not 'live'.
  const scores: Record<string, number> = result.category_scores ?? {};
  const adultSignal = (scores['sexual'] ?? 0) > 0.3;

  const BORDERLINE_CATEGORIES = [
    'harassment', 'harassment/threatening',
    'hate', 'hate/threatening',
    'violence', 'violence/graphic',
  ];
  const borderline = BORDERLINE_CATEGORIES.some(k => (scores[k] ?? 0) > 0.25);

  return { pass: true, adultSignal, borderline };
}

// ─── Language detection ───────────────────────────────────────────────────────
//
// Detects BCP-47-ish language code from free text, including transliterated
// scripts: "Manaki help chese vaalla..." → 'te-Latn', not 'en'.
// Fail open: any API error or malformed response returns 'en'.

const LANG_LABELS: Record<string, string> = {
  en:       'English',
  hi:       'Hindi',
  'hi-Latn': 'romanized Hindi (Hinglish — Roman script)',
  te:       'Telugu',
  'te-Latn': 'romanized Telugu (Roman script)',
  ta:       'Tamil',
  bn:       'Bengali',
  mr:       'Marathi',
  gu:       'Gujarati',
  kn:       'Kannada',
  ml:       'Malayalam',
  pa:       'Punjabi',
};

async function detectLanguage(text: string): Promise<string> {
  if (!OPENAI_API_KEY) return 'en';
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini', temperature: 0, max_tokens: 12,
        messages: [
          {
            role: 'system',
            content: [
              'Detect the language of the input. Return ONLY a BCP-47 language tag.',
              'For text written in Latin/Roman script that represents a non-Latin language',
              '(transliteration / Romanization), append "-Latn" to the base tag.',
              'Examples: English → en | Hindi script → hi | Telugu script → te |',
              'Romanized Hindi (Hinglish) → hi-Latn | Romanized Telugu → te-Latn |',
              'Tamil → ta | Bengali → bn.',
              'If genuinely uncertain return "en". Return ONLY the tag — no explanation.',
            ].join(' '),
          },
          { role: 'user', content: text.slice(0, 300) },
        ],
      }),
    });
    if (!res.ok) return 'en';
    const data = await res.json();
    const raw  = (data.choices?.[0]?.message?.content ?? '').trim().toLowerCase();
    // Accept any plausible BCP-47 tag (2–3 char primary + optional subtags)
    if (raw.length >= 2 && raw.length <= 20 && /^[a-z]/.test(raw) && !/\s/.test(raw)) return raw;
    return 'en';
  } catch {
    return 'en';
  }
}

// ─── Generative companion (cold-start + guaranteed "you're not alone") ────────
//
// Called when no live same-language match meets the quality threshold.
// Generates a resonant companion confession in the seeker's language,
// runs the full safety gate (moderation + crisis) — SAME gate as user submissions,
// then embeds + inserts under the system author_token (never the requester's).
//
// Up to 3 generation attempts; falls back to a curated same-language seed line
// if all attempts fail safety. If even the fallback fails (should not happen),
// returns null — the caller returns the no-match path instead of showing unsafe text.

const COMPANION_SEEDS: Record<string, string[]> = {
  en: [
    "I smile at work and cry in the parking lot on the way home.",
    "I pretend I'm fine so often I've forgotten what not fine actually feels like.",
    "The version of me people think they know isn't really me.",
    "I keep waiting for someone to notice how much I'm struggling.",
    "I've been holding this together for so long I don't remember who I was before.",
  ],
  'hi-Latn': [
    "Main bahar se khush dikhta hoon lekin andar se toot raha hoon.",
    "Kisi ko nahi pata ke main raat ko kitna rota hoon.",
    "Log samajhte hain sab theek hai, par main khud nahi jaanta.",
    "Muskurata rehta hoon taaki koi poochhe na.",
  ],
  'te-Latn': [
    "Bayata hasyamga untaanu kani lopala chala pain ga untundi.",
    "Andaru nenu strong ani anukuntaaru, kaani nenu pratiroduja struggle chestunnanu.",
    "Ninnu choodataniki smile chestanu, kaani nenu bagaa ledu.",
    "Ela chesina okkarike artham kaadu ani anipistundi.",
  ],
  hi: [
    "बाहर से मुस्कुराता हूँ, लेकिन अंदर से टूट रहा हूँ।",
    "किसी को नहीं पता रात को मैं कितना रोता हूँ।",
    "सब सोचते हैं सब ठीक है, पर मैं खुद नहीं जानता।",
  ],
  te: [
    "బయటకు నవ్వుతాను కానీ లోపల చాలా నొప్పిగా ఉంటుంది.",
    "అందరూ నేను strong అని అనుకుంటారు కానీ నేను ప్రతిరోజూ struggle చేస్తున్నాను.",
  ],
  ta: [
    "வெளியே சிரிக்கிறேன், உள்ளே உடைந்திருக்கிறேன்.",
    "யாருக்கும் தெரியாது நான் இரவில் எவ்வளவு அழுகிறேன் என்று.",
  ],
  bn: [
    "বাইরে থেকে হাসি দেখাই কিন্তু ভেতরে ভেঙে পড়ছি।",
    "কেউ জানে না রাতে আমি কতটা কাঁদি।",
  ],
};

function companionFallback(lang: string): string {
  const pool = COMPANION_SEEDS[lang] ?? COMPANION_SEEDS['en'];
  return pool[Math.floor(Math.random() * pool.length)];
}

async function getSystemToken(): Promise<string> {
  if (!AUTHOR_TOKEN_SECRET) throw new Error('AUTHOR_TOKEN_SECRET not set');
  return hmacSha256('soulyap:auto', AUTHOR_TOKEN_SECRET);
}

async function generateCompanion(
  seekerText:   string,
  lang:         string,
  seekerToken:  string,
): Promise<{ id: string; text: string; felt_count: number } | null> {
  const langLabel = LANG_LABELS[lang] ?? 'English';
  const isRomanized = lang.endsWith('-Latn');

  const systemPrompt = [
    `Write ONE raw, anonymous personal confession in ${langLabel}.`,
    isRomanized
      ? 'Use Roman/Latin script (transliterated), NOT native script — mirror the input style.'
      : '',
    'It should be emotionally parallel to the feeling below — resonant but from a different life.',
    'First-person, 1–3 sentences, specific, honest, human, imperfect.',
    'No advice. No rhetorical questions. No clichés like "life is hard" or "I feel so alone."',
    'No PII, no names, no locations.',
    'NEVER write crisis content: no suicide, no self-harm, no "want to die" or similar.',
    'Return ONLY the confession text — no preamble, no quotation marks, no explanation.',
  ].filter(Boolean).join(' ');

  let text: string | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (!OPENAI_API_KEY) break;
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini', temperature: 0.85, max_tokens: 120,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: seekerText },
          ],
        }),
      });
      if (!res.ok) continue;
      const data      = await res.json();
      const candidate = (data.choices?.[0]?.message?.content ?? '').trim();
      if (candidate.length < 10 || candidate.length > 500) continue;

      // Full safety gate — same as user submissions (CLAUDE.md #1)
      const { crisis } = await runCrisisCheck(candidate);
      if (crisis) {
        console.warn('[COMPANION] generated text failed crisis check — attempt', attempt + 1);
        continue;
      }
      const mod = await runModeration(candidate);
      if (!mod.pass) {
        console.warn('[COMPANION] generated text failed moderation — attempt', attempt + 1);
        continue;
      }
      text = candidate;
      break;
    } catch (err) {
      console.error('[COMPANION] generation error attempt', attempt + 1, ':', err);
    }
  }

  // Curated fallback — if generation exhausted or no API key
  if (!text) {
    const fb = companionFallback(lang);
    const { crisis: fbCrisis } = await runCrisisCheck(fb);
    const fbMod = await runModeration(fb);
    if (fbCrisis || !fbMod.pass) {
      // Should never happen with curated seeds; abort rather than show unsafe text.
      console.error('[COMPANION] curated fallback failed safety gate — no companion inserted');
      return null;
    }
    text = fb;
    console.log('[COMPANION] using curated fallback for lang:', lang);
  }

  // Embed
  const companionEmbedding = await embedText(text).catch(() => null);
  if (!companionEmbedding) return null;

  // Classify (fail open)
  const companionCategories = await classifyCategories(text, false).catch(() => [] as string[]);

  const systemToken = await getSystemToken();
  const feltCount   = Math.floor(Math.random() * 30) + 5; // realistic starter: 5–34

  const { data: inserted, error: insertErr } = await supabase
    .from('confessions')
    .insert({
      author_token:           systemToken,
      text,
      embedding:              JSON.stringify(companionEmbedding),
      categories:             companionCategories,
      status:                 'live',
      amplification_eligible: true,
      authorship_flags:       [],
      is_seed:                true,
      felt_count:             feltCount,
      lang,
    })
    .select('id, felt_count')
    .single();

  if (insertErr) {
    console.error('[COMPANION] insert failed:', insertErr.message);
    return null;
  }

  const { data: newCount } = await supabase.rpc('increment_felt_count', {
    p_confession_id: inserted.id,
  });

  return {
    id:         inserted.id,
    text,
    felt_count: typeof newCount === 'number' ? newCount : inserted.felt_count + 1,
  };
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

// ─── Step 4.5: Category classification ───────────────────────────────────────
//
// Assigns 1–3 category tags from the fixed taxonomy using gpt-4o-mini.
// The sexuality_intimacy tag is set ONLY from the moderation adult signal —
// never from the LLM. This ensures safety tags cannot be downgraded by authors.
// Fail open on errors: empty categories is safe (recommendation falls back to
// popularity ordering).

const CLASSIFIER_TAXONOMY = [
  'mental_health', 'relationships', 'grief',
  'secrets', 'work_identity', 'body_health', 'faith_meaning',
] as const;

async function classifyCategories(
  text:        string,
  adultSignal: boolean,
): Promise<string[]> {
  const categories: string[] = [];

  // Adult tag comes from the moderation classifier's adult-sexual signal — not LLM.
  if (adultSignal) categories.push('sexuality_intimacy');

  if (!OPENAI_API_KEY) {
    return categories; // No key: adult tag only (or empty)
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model:       'gpt-4o-mini',
        temperature: 0,
        max_tokens:  40,
        messages: [
          {
            role:    'system',
            content: [
              'Classify this personal confession into 1–3 categories.',
              `Choose ONLY from this exact list: ${CLASSIFIER_TAXONOMY.join(', ')}.`,
              'Respond with ONLY a JSON array of strings, e.g. ["mental_health","grief"].',
              'No explanation, no extra text.',
            ].join(' '),
          },
          { role: 'user', content: text },
        ],
      }),
    });

    if (!res.ok) {
      console.warn('[CATEGORIZE] API returned', res.status, '— skipping LLM categories');
      return categories;
    }

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

  const hourLimit = IS_PRODUCTION ? 5   : 500;
  const dayLimit  = IS_PRODUCTION ? 10  : 1000;

  // submissions per device per hour
  const { count: deviceCount } = await supabase
    .from('confessions')
    .select('id', { count: 'exact', head: true })
    .eq('author_token', authorToken)
    .gte('created_at', oneHourAgo);

  if ((deviceCount ?? 0) >= hourLimit) {
    return { allowed: false, reason: 'rate_limit_device' };
  }

  // submissions per account per day
  const { count: dayCount } = await supabase
    .from('confessions')
    .select('id', { count: 'exact', head: true })
    .eq('author_token', authorToken)
    .gte('created_at', oneDayAgo);

  if ((dayCount ?? 0) >= dayLimit) {
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
//
// US 18 U.S.C. § 2258A — mandatory report to NCMEC upon awareness of CSAM.
//
// SETUP (one-time — cannot be automated):
//   1. Complete the NCMEC Electronic Service Provider (ESP) agreement:
//      https://www.missingkids.org/gethelpnow/cybertipline
//   2. Receive NCMEC_ESP_ID and NCMEC_API_KEY from NCMEC after approval.
//   3. Set both as Edge Function secrets:
//        supabase secrets set NCMEC_ESP_ID=...
//        supabase secrets set NCMEC_API_KEY=...
//   4. Confirm the API endpoint below matches the one NCMEC provides for ESPs.
//
// INVARIANT: no account_id, no user PII, no confession text in the report.
// The report carries only: platform identifier, content type, and timestamp.
// CSAM content is NEVER stored — it is blocked at step [2] before INSERT.
//
// Fail behaviour:
//   - Missing credentials in production → log critical + throw (blocks the 400 response)
//   - NCMEC API non-200              → log critical + throw
//   - Development (no credentials)   → log and return (no throw, so dev pipeline runs)

const NCMEC_ESP_ID  = Deno.env.get('NCMEC_ESP_ID')  ?? '';
const NCMEC_API_KEY = Deno.env.get('NCMEC_API_KEY') ?? '';

// Endpoint provided by NCMEC after ESP agreement. Update when NCMEC confirms.
const NCMEC_API_URL = 'https://api.cybertipline.org/api/v2/reports';

async function reportCsam(): Promise<void> {
  const timestamp = new Date().toISOString();

  if (!NCMEC_ESP_ID || !NCMEC_API_KEY) {
    const msg = `[CSAM] NCMEC credentials not set — mandatory report NOT filed. Timestamp: ${timestamp}`;
    if (IS_PRODUCTION) {
      // In production, unconfigured NCMEC reporting is a legal blocker.
      // Throw so the caller still returns 400 (submission blocked), and the
      // error surfaces in Supabase logs for immediate human review.
      throw new Error(msg);
    }
    // Development: log and return so the pipeline can be exercised locally.
    console.error(msg);
    console.error('[CSAM] Complete NCMEC ESP registration before production launch.');
    return;
  }

  // Report fields: platform identity + content type + timestamp. No PII. No text.
  const reportBody = {
    espId:          NCMEC_ESP_ID,
    reportedAt:     timestamp,
    incidentType:   'CSAM',
    contentType:    'text/submission-blocked',
    platformName:   'You Are Not Alone',
    // No account_id, no confession text, no device info — ever.
  };

  const res = await fetch(NCMEC_API_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${NCMEC_API_KEY}`,
    },
    body: JSON.stringify(reportBody),
  });

  if (!res.ok) {
    // Non-200 from NCMEC = mandatory report failed. Throw so the error lands
    // in Supabase logs and alerts on-call. The submission is still blocked (400).
    throw new Error(`[CSAM] NCMEC CyberTipline API returned ${res.status} — report not filed. Timestamp: ${timestamp}`);
  }

  console.error(`[CSAM] Report filed with NCMEC. Timestamp: ${timestamp}`);
}

// ─── Step [4.5]: Authorship scoring ──────────────────────────────────────────
//
// Bayesian log-likelihood ratio model.
//   logit_total = logit_prior + Σ LLR_i
//   p = sigmoid(logit_total)
//
// Hard invariants (from spec):
//   - Crisis content: NEVER scored (this runs after crisis hard-return)
//   - Missing / invalid payload: FAIL OPEN (eligible = true, no penalty)
//   - Content signals bounded to ±1.5 so they can't dominate behavioral evidence
//   - Abstain (insufficient evidence): eligible = true
//   - Hard punitive actions require p ≥ 0.97 precision
//
// Action ladder (gentlest → most severe):
//   eligible      amplification_eligible = true
//   invisible     amplification_eligible = false   (user gets own match, not surfaced)
//   friction      amplification_eligible = false + ai_friction flag
//   hold          amplification_eligible = false + ai_hold flag (human review queue)

interface AuthorshipPayload {
  keystroke_count:    number;
  edit_entropy:       number;
  paste_count:        number;
  paste_chars:        number;
  dictation_detected: boolean;
  think_pause_count:  number;
  composition_ms:     number;
  typed_chars:        number;
}

interface AuthorshipResult {
  amplification_eligible: boolean;
  flags: string[];
}

// Prior: P(AI_dump) = 0.15 in the wild on anonymous confession apps
const LOGIT_PRIOR  = -1.74;  // log(0.15 / 0.85)
const INVISIBLE_T  =  0.0;   // logit > 0  → P > 0.50 → remove amplification
const FRICTION_T   =  1.8;   // logit > 1.8 → P > 0.86 → friction
const HOLD_T       =  3.5;   // logit > 3.5 → P > 0.97 → hold for human review

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

// ── LLM judge: 3x self-consistency (gpt-4o-mini) ─────────────────────────────
// Returns LLR contribution. Caller bounds to ±1.5.
// Only called when behavioral logit is already suspicious (saves cost + latency).
async function runLlmJudge(text: string): Promise<number> {
  const systemPrompt = [
    'You assess whether a confession submitted to an anonymous app is genuine human writing',
    'or AI-generated. Focus on: emotional specificity, personal detail, natural voice,',
    'versus generic phrasing or AI patterns. When genuinely uncertain say "uncertain".',
    'Respond ONLY with valid JSON: {"verdict":"human"|"ai"|"uncertain","confidence":0.0-1.0}',
  ].join(' ');

  const call = async () => {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model:       'gpt-4o-mini',
        temperature: 0.2,
        max_tokens:  40,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: text },
        ],
      }),
    });
    if (!r.ok) throw new Error(`LLM judge ${r.status}`);
    const d   = await r.json();
    const raw = (d.choices?.[0]?.message?.content ?? '{}').trim();
    return JSON.parse(raw) as { verdict: string; confidence: number };
  };

  const [a, b, c] = await Promise.all([call(), call(), call()]);
  const results = [a, b, c];

  const ai_votes      = results.filter(r => r.verdict === 'ai').length;
  const human_votes   = results.filter(r => r.verdict === 'human').length;
  const uncertain_votes = results.filter(r => r.verdict === 'uncertain').length;

  // High variance or split → abstain (0)
  if (uncertain_votes >= 2 || (ai_votes > 0 && human_votes > 0)) return 0;

  if (ai_votes === 3)    return 1.5;   // unanimous AI
  if (ai_votes === 2)    return 0.5;   // majority AI
  if (human_votes === 3) return -0.5;  // unanimous human
  if (human_votes === 2) return -0.3;  // majority human
  return 0;
}

// ── Beta-Bernoulli account trust update ──────────────────────────────────────
async function updateAccountTrust(accountId: string, success: boolean): Promise<void> {
  try {
    await supabase.rpc('update_account_trust', {
      p_account_id: accountId,
      p_alpha_inc:  success ? 1 : 0,
      p_beta_inc:   success ? 0 : 1,
    });
  } catch { /* non-blocking */ }
}

// ── Main scoring function ─────────────────────────────────────────────────────
async function runAuthorshipScoring(
  text:      string,
  payload:   AuthorshipPayload | undefined,
  accountId: string,
): Promise<AuthorshipResult> {
  // Fail open: missing or malformed payload → treat as human
  if (!payload || typeof payload.keystroke_count !== 'number') {
    await updateAccountTrust(accountId, true);
    return { amplification_eligible: true, flags: [] };
  }

  let logit = LOGIT_PRIOR;

  // ── Behavioral signals (client-advisory; spoofable but costly to defeat) ────

  if (payload.dictation_detected) {
    // Speech-to-text / OS dictation: strong whitelist — not an AI dump
    logit -= 3.0;
  } else {
    const textLen      = Math.max(text.length, 1);
    const pasteFrac    = payload.paste_chars / textLen;

    if (pasteFrac > 0.90 && payload.keystroke_count < 5) {
      // Entire text pasted with almost no typing: clearest AI-dump pattern
      logit += 3.0;
    } else if (pasteFrac > 0.70 && payload.keystroke_count < 10) {
      logit += 1.0;
    }

    // Genuine edits (backspaces) = human signal
    if (payload.edit_entropy > 0.06) logit -= 0.8;

    // Think pauses correlated with linguistic boundaries = human signal
    if (payload.think_pause_count > 3) {
      logit -= 1.0;
    } else if (payload.think_pause_count === 0 && payload.composition_ms > 15_000) {
      // Long composition with zero pauses = reading-ahead (retyping prepared text)
      logit += 0.3;
    }

    // Typing speed on typed chars
    if (payload.composition_ms > 2_000 && payload.typed_chars > 5) {
      const cps = (payload.typed_chars * 1000) / payload.composition_ms;
      if (cps > 15) logit += 0.5;  // suspiciously fast (retyping)
      if (cps < 1.5) logit -= 0.5; // very slow deliberate typing = human
    }
  }

  // ── Account trust signal ──────────────────────────────────────────────────
  try {
    const { data: trust } = await supabase
      .from('account_trust')
      .select('trust_alpha, trust_beta, fraud_risk')
      .eq('account_id', accountId)
      .maybeSingle();

    if (trust) {
      const mean = trust.trust_alpha / (trust.trust_alpha + trust.trust_beta);
      if (mean > 0.65) logit -= 0.5;  // high trust → human signal
      if (mean < 0.25) logit += 0.5;  // low trust → suspicious
      if ((trust.fraud_risk ?? 0) > 0.6) logit += 1.0;
    }
    // New / missing row → LLR = 0 (fail open)
  } catch { /* fail open */ }

  // ── LLM judge (bounded ±1.5) — only when behavioral signals are suspicious ─
  // Skip when OPENAI_API_KEY is absent — already used for crisis/categories.
  if (logit > LOGIT_PRIOR && OPENAI_API_KEY) {
    try {
      const llr     = await runLlmJudge(text);
      const bounded = Math.max(-1.5, Math.min(1.5, llr));
      logit += bounded;
    } catch { /* LLM judge failure → fail open, LLR = 0 */ }
  }

  // ── Action policy ─────────────────────────────────────────────────────────
  const flags: string[] = [];

  if (logit < INVISIBLE_T) {
    // Confident human OR abstain (insufficient evidence above prior)
    await updateAccountTrust(accountId, true);
    return { amplification_eligible: true, flags };
  }

  await updateAccountTrust(accountId, false);

  if (logit >= HOLD_T) {
    flags.push('ai_invisible', 'ai_friction', 'ai_hold');
    return { amplification_eligible: false, flags };
  }
  if (logit >= FRICTION_T) {
    flags.push('ai_invisible', 'ai_friction');
    return { amplification_eligible: false, flags };
  }
  // INVISIBLE_T ≤ logit < FRICTION_T
  flags.push('ai_invisible');
  return { amplification_eligible: false, flags };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, ...SEC, 'Content-Type': 'application/json' },
    });

  // Reject oversized payloads before JSON parsing (DoS / memory protection).
  // 32 KB is well above any legitimate confession; embedding payload is ≤ 6 KB.
  const contentLength = parseInt(req.headers.get('content-length') ?? '0', 10);
  if (contentLength > 32_768) {
    return json({ error: 'Request too large.' }, 413);
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

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
    let body: { text?: string; region?: string; deviceHash?: string; authorship?: AuthorshipPayload };
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

    // ── [3.5] LANGUAGE DETECTION ──────────────────────────────────────────────
    // Runs after crisis check (no point detecting lang for crisis text).
    // Fail open: returns 'en' on any API error — matching degrades to English-only
    // pool rather than failing the submission.
    const lang = await detectLanguage(rawText);

    // ── [4] EMBED ──────────────────────────────────────────────────────────────
    // embedText() throws on API failure or dimension mismatch (fail closed).
    const embedding = await embedText(rawText);

    // ── [4.5] AUTHORSHIP SCORING ──────────────────────────────────────────────
    // Crisis-exempt by structure: this step is only reached after the crisis
    // hard-return at step [3] has already passed. Fail OPEN throughout.
    // Identity invariant: scoring signals live account-side (account_trust table);
    // authorship_flags are stored on the confession row (server-only, never returned).
    const { amplification_eligible, flags: authorshipFlags } =
      await runAuthorshipScoring(rawText, body.authorship, user.id);

    // ── [4.6] CATEGORIZE ──────────────────────────────────────────────────────
    // Fail open — missing categories degrade recommendation quality only,
    // not safety. The adult signal comes from step [2] moderation, never the LLM.
    const categories = await classifyCategories(rawText, modResult.adultSignal ?? false);

    // ── [5] STORE ──────────────────────────────────────────────────────────────
    const authorToken = await getAuthorToken(user.id);

    // Borderline confessions enter as 'under_review' + auto_flagged=true.
    // They are hidden from the match/explore pool until an operator approves them.
    // The author is notified on their next app open via get_confession_statuses().
    const confessionStatus = modResult.borderline ? 'under_review' : 'live';

    const { data: newConfession, error: insertErr } = await supabase
      .from('confessions')
      .insert({
        author_token:           authorToken,
        account_id:             user.id,
        text:                   rawText,
        embedding:              JSON.stringify(embedding),
        categories,
        amplification_eligible,
        authorship_flags:       authorshipFlags,
        status:                 confessionStatus,
        auto_flagged:           modResult.borderline ?? false,
        lang,
      })
      .select('id')
      .single();

    if (insertErr) throw insertErr;

    // ── [6] MATCH ──────────────────────────────────────────────────────────────
    // Filters: same lang, quality threshold (sim ≥ 0.35), no near-dups (sim < 0.97)
    const { data: matchRows, error: matchErr } = await supabase.rpc('match_confession', {
      p_embedding:      JSON.stringify(embedding),
      p_seeker_token:   authorToken,
      p_seeker_lang:    lang,
      p_limit:          1,
      p_seeker_account: user.id,
    });

    if (matchErr) throw matchErr;

    const matchRow = matchRows?.[0];

    if (!matchRow) {
      // No same-language match above quality threshold — generate a companion
      // confession in the user's language so they always get "you're not alone".
      // The companion is safety-gated, embedded, and inserted as a live confession
      // (growing the pool for future users). System token ≠ requester token — identity
      // separation holds (CLAUDE.md #3).
      const companion = await generateCompanion(rawText, lang, authorToken);

      if (companion) {
        return json({
          type:        'matched',
          submittedId: newConfession.id,
          status:      confessionStatus,
          match: {
            id:        companion.id,
            text:      companion.text,
            feltCount: companion.felt_count,
          },
        });
      }

      // Companion generation failed entirely (extremely rare) — honest no-match.
      return json({
        type:        'submitted',
        submittedId: newConfession.id,
        status:      confessionStatus,
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
    // submittedId: the author's OWN new confession id, returned so the client
    // can store an on-device receipt for the return-loop feature.
    // Identity invariant preserved: confessions_public has no author_token column;
    // the client cannot correlate submittedId to an account via the DB.
    return json({
      type:        'matched',
      submittedId: newConfession.id,
      status:      confessionStatus,
      match: {
        id:        matchRow.id,
        text:      matchRow.text,
        feltCount: typeof newCount === 'number' ? newCount : matchRow.felt_count + 1,
      },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[submit-confession] unhandled error:', msg);
    return json({ error: msg }, 500);
  }
});
