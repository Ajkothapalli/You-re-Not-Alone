/**
 * Edge Function: ingest-stories
 *
 * Takes stories that were written by hand (owner decision 2026-10-27: no
 * model generates the pool any more) and puts each one through the same
 * safety gates every auto-generated line used to pass, then inserts it.
 *
 *   POST { stories: [{ text, category, lang }] }   ≤ 30 per call
 *     → { results: [{ i, ok, reason? }], inserted }
 *   POST { action: 'recent', limit? }
 *     → { recent: [{ category, lang, opening }] }
 *        Openings of the most recent GENERATED stories only (never a real
 *        user's confession), so the writer can avoid repeating itself.
 *
 * Auth: the public anon JWT in Authorization (satisfies the gateway) plus
 * STORY_INGEST_SECRET in x-story-secret, compared in constant time.
 *
 * What it deliberately does NOT do:
 *   - call any paid model. The only external call is OpenAI's moderation
 *     endpoint, which is free and IS the safety gate — fail closed.
 *   - invent a felt count. Stories start at 0 and only real felts raise it
 *     (owner decision 2026-10-27: "real felts only").
 *   - log text. Logs carry counts and reason codes only.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AUTHOR_TOKEN_SECRET  = Deno.env.get('AUTHOR_TOKEN_SECRET')!;
const STORY_INGEST_SECRET  = Deno.env.get('STORY_INGEST_SECRET') ?? '';
// || not ??: an empty-string key must not count as configured (CLAUDE.md,
// incident 2026-09-13).
const MODERATION_API_KEY   = Deno.env.get('MODERATION_API_KEY') || Deno.env.get('OPENAI_API_KEY') || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export const CATEGORIES = [
  'mental_health', 'relationships', 'grief',
  'secrets', 'work_identity', 'body_health', 'faith_meaning',
] as const;
export const LANGS = ['en', 'hi-Latn'] as const;

const MAX_PER_CALL = 30;
const MIN_CHARS    = 60;
const MAX_CHARS    = 1100;

// Same list as push-daily-stories and submit-confession's Layer 1. A story is
// written about pain, never about wanting to die — anything that trips this is
// dropped, not softened.
const CRISIS_KEYWORDS = [
  'kill myself', 'killing myself', 'end my life', 'take my life',
  'suicide', 'suicidal', 'want to die', 'want to be dead',
  'hurt myself', 'self harm', 'self-harm', 'cutting myself',
  'overdose', 'no reason to live', 'not worth living',
  "can't go on", "cant go on", 'end it all', 'better off dead',
  'take my own life', "don't want to live", 'nothing to live for',
  'mar jaana', 'mar jaun', 'mar jaau', 'jeena nahi', 'khudkushi', 'aatmahatya',
];

export function hasCrisis(text: string): boolean {
  const lower = text.toLowerCase();
  return CRISIS_KEYWORDS.some(kw => lower.includes(kw));
}

/** Lowercase, strip punctuation, collapse spaces — for duplicate checks. */
export function normalise(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** Why a story is rejected before any network call, or null if it may proceed. */
export function precheck(s: { text?: unknown; category?: unknown; lang?: unknown }): string | null {
  if (typeof s.text !== 'string') return 'no_text';
  const text = s.text.trim();
  if (text.length < MIN_CHARS) return 'too_short';
  if (text.length > MAX_CHARS) return 'too_long';
  if (!(CATEGORIES as readonly string[]).includes(String(s.category))) return 'bad_category';
  if (!(LANGS as readonly string[]).includes(String(s.lang))) return 'bad_lang';
  if (hasCrisis(text)) return 'crisis';
  // No links, handles or phone numbers — same reason the substance gate
  // rejects contact_or_link for real users.
  if (/https?:\/\/|www\.|@\w{2,}|\b\d{10}\b/i.test(text)) return 'contact_or_link';
  return null;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function passesModeration(text: string): Promise<boolean> {
  if (!MODERATION_API_KEY) return false; // stub rule: no key blocks, never passes
  try {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MODERATION_API_KEY}` },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: text }),
    });
    if (!res.ok) return false; // fail closed
    const data = await res.json();
    return !(data.results?.[0]?.flagged ?? true);
  } catch {
    return false;
  }
}

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-story-secret',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method !== 'POST') return respond({ error: 'POST only' }, 405);
  if (!STORY_INGEST_SECRET) {
    console.error('[INGEST] STORY_INGEST_SECRET not set — refusing all requests');
    return respond({ error: 'not_configured' }, 503);
  }
  if (!timingSafeEqual(req.headers.get('x-story-secret') ?? '', STORY_INGEST_SECRET)) {
    return respond({ error: 'Unauthorized' }, 401);
  }

  let body: { action?: string; limit?: number; stories?: unknown };
  try { body = await req.json(); } catch { return respond({ error: 'bad_json' }, 400); }

  // ── Recent openings, so the writer does not repeat itself ───────────────────
  if (body.action === 'recent') {
    const limit = Math.min(Math.max(Number(body.limit) || 150, 1), 400);
    const { data, error } = await supabase
      .from('confessions')
      .select('categories, lang, text')
      .eq('source', 'generated')          // NEVER a real user's words
      .eq('status', 'live')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return respond({ error: 'read_failed' }, 500);
    return respond({
      recent: (data ?? []).map(r => ({
        category: r.categories?.[0] ?? null,
        lang:     r.lang,
        opening:  String(r.text).slice(0, 90),
      })),
    });
  }

  // ── Ingest ───────────────────────────────────────────────────────────────────
  if (!Array.isArray(body.stories) || body.stories.length === 0) {
    return respond({ error: 'no_stories' }, 400);
  }
  if (body.stories.length > MAX_PER_CALL) {
    return respond({ error: `max_${MAX_PER_CALL}_per_call` }, 400);
  }

  const autoToken = await hmacSha256('soulyap:auto', AUTHOR_TOKEN_SECRET);
  const results: Array<{ i: number; ok: boolean; reason?: string }> = [];
  const seenInBatch = new Set<string>();
  let inserted = 0;

  for (let i = 0; i < body.stories.length; i++) {
    const s = body.stories[i] as { text?: unknown; category?: string; lang?: string };
    const why = precheck(s);
    if (why) { results.push({ i, ok: false, reason: why }); continue; }

    const text = (s.text as string).trim();
    const norm = normalise(text);
    if (seenInBatch.has(norm)) { results.push({ i, ok: false, reason: 'duplicate' }); continue; }
    seenInBatch.add(norm);

    // Duplicate against the live pool: same opening (first 60 normalised chars).
    const { count: dupes } = await supabase
      .from('confessions')
      .select('id', { count: 'exact', head: true })
      .eq('source', 'generated')
      .ilike('text', `${text.slice(0, 60).replace(/[%_\\]/g, '\\$&')}%`);
    if ((dupes ?? 0) > 0) { results.push({ i, ok: false, reason: 'duplicate' }); continue; }

    if (!(await passesModeration(text))) {
      results.push({ i, ok: false, reason: 'moderation' });
      continue;
    }

    const { error } = await supabase.from('confessions').insert({
      author_token:           autoToken,
      text,
      embedding:              null,
      categories:             [s.category],
      status:                 'live',
      amplification_eligible: true,
      authorship_flags:       [],
      source:                 'generated',
      felt_count:             0,
      lang:                   s.lang,
    });
    if (error) {
      console.error(`[INGEST] insert failed #${i}: ${error.code ?? ''}`);
      results.push({ i, ok: false, reason: 'insert_failed' });
      continue;
    }
    inserted++;
    results.push({ i, ok: true });
  }

  const reasons = results.filter(r => !r.ok).map(r => r.reason);
  console.log(`[INGEST] received=${body.stories.length} inserted=${inserted} rejected=${JSON.stringify(reasons)}`);
  return respond({ inserted, results });
});
