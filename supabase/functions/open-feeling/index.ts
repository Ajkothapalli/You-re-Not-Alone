/**
 * Edge Function: open-feeling
 *
 * Turns a share token into the one thing a doorway page needs to render. No
 * user auth — the visitor is a stranger with a link, which is the point.
 *
 * ── What it will not do ─────────────────────────────────────────────────────
 * Lookup is by the random 10-character TOKEN only. There is no path from a
 * confession id to a page, so pages cannot be enumerated: guessing a token is
 * guessing 62^10.
 *
 * The response carries RENDERED CONTENT, never a row. No confession id, no
 * account id, no author token, no persona, no timestamp — not even in a field
 * the page happens not to use. Anything returned here is public forever the
 * moment it reaches a browser.
 *
 * ── Every failure looks identical ───────────────────────────────────────────
 * Invalid token, unknown token, removed, reported, under review, expired,
 * generated content — all return exactly the same `gone` body. A visitor (or
 * a scraper) must not be able to tell "this token never existed" from "this
 * one did and the confession was taken down", because the difference is
 * itself information about a real person's confession.
 *
 * ── Sealed stays sealed ─────────────────────────────────────────────────────
 * The sharer's "Include my words" choice is read from the token row, captured
 * at share time. A sealed share never reveals the words, no matter who asks
 * or how long ago it was shared.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AUTHOR_TOKEN_SECRET  = Deno.env.get('AUTHOR_TOKEN_SECRET') ?? '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'content-type, x-visitor-ip, x-visitor-ua',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const SEC = {
  'X-Content-Type-Options': 'nosniff',
  // The page is private to whoever holds the link, and must never be cached
  // by a shared proxy or indexed.
  'Cache-Control':          'private, no-store',
  'X-Robots-Tag':           'noindex, nofollow',
  'Referrer-Policy':        'same-origin',
};

const TOKEN_RE = /^[A-Za-z0-9]{10}$/;
/** Opens per visitor hash per minute. */
const RATE_PER_MIN = 30;

/**
 * Link-preview fetchers and crawlers. A preview is NOT a person opening a
 * link — counting them would tell a sharer that two people opened something
 * when what actually happened is that WhatsApp and Telegram each fetched a
 * thumbnail. That would make the whole notification a lie.
 */
const BOT_RE = new RegExp([
  'bot', 'crawler', 'spider', 'crawling',
  'whatsapp', 'facebookexternalhit', 'facebookcatalog', 'telegrambot',
  'slackbot', 'slack-imgproxy', 'twitterbot', 'discordbot', 'linkedinbot',
  'skypeuripreview', 'pinterest', 'redditbot', 'applebot', 'googlebot',
  'bingbot', 'yandex', 'duckduckbot', 'baiduspider',
  'embedly', 'quora link preview', 'outbrain', 'vkshare', 'w3c_validator',
  'preview', 'fetcher', 'monitoring', 'curl/', 'wget', 'python-requests',
  'headlesschrome',
].join('|'), 'i');

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, ...SEC, 'Content-Type': 'application/json' },
  });
}

/** The single response for every failure. See the header. */
const GONE = { kind: 'gone' as const };

async function hmac(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(AUTHOR_TOKEN_SECRET || 'fallback'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * A de-duplication key, not a visitor identity.
 *
 * The DAY is inside the hash, so the same person tomorrow produces an
 * unrelated value and nothing here can follow anyone across time. The raw IP
 * and user agent are never stored.
 */
async function visitorHash(ip: string, ua: string, day: string): Promise<string> {
  return hmac(`open:${day}:${ip}:${ua}`);
}

const CATEGORIES: Record<string, { label: string; color: string }> = {
  mental_health:  { label: 'Mental health',   color: '#9C8BF6' },
  relationships:  { label: 'Relationships',   color: '#F5996E' },
  grief:          { label: 'Grief & loss',    color: '#7FA0FF' },
  secrets:        { label: 'Secrets & guilt', color: '#FBBF24' },
  work_identity:  { label: 'Work & identity', color: '#4FC8D6' },
  body_health:    { label: 'Body & health',   color: '#9BC47E' },
  faith_meaning:  { label: 'Faith & meaning', color: '#B795E8' },
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json({ error: 'Method not allowed.' }, 405);

  let body: { t?: unknown };
  try { body = await req.json(); } catch { return json(GONE); }

  const token = typeof body.t === 'string' ? body.t : '';
  // Same shape and code as a real miss — see the header.
  if (!TOKEN_RE.test(token)) return json(GONE);

  // The website proxies the real visitor's details; fall back to the direct
  // connection when called without them.
  const ip = req.headers.get('x-visitor-ip')
    ?? req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? 'unknown';
  const ua = req.headers.get('x-visitor-ua') ?? req.headers.get('user-agent') ?? '';

  const day     = new Date().toISOString().slice(0, 10);
  const visitor = await visitorHash(ip, ua, day);

  // ── Rate limit ─────────────────────────────────────────────────────────────
  const { count: recent } = await supabase
    .from('share_opens')
    .select('token', { count: 'exact', head: true })
    .eq('visitor_hash', visitor)
    .gte('created_at', new Date(Date.now() - 60_000).toISOString());

  if ((recent ?? 0) > RATE_PER_MIN) return json(GONE, 429);

  // ── The token ──────────────────────────────────────────────────────────────
  const { data: share } = await supabase
    .from('share_tokens')
    .select('token, bucket, confession_id, words_included, question_id, created_at')
    .eq('token', token)
    .maybeSingle();

  if (!share) return json(GONE);

  const isBot = BOT_RE.test(ua) || ua.trim() === '';

  /** A real visit, counted once per visitor per day. Previews never count. */
  async function recordOpen() {
    if (isBot) return;
    await supabase.from('share_opens')
      .insert({ token, day, visitor_hash: visitor })
      .then(() => {}, () => {});     // duplicate key = already counted today
  }

  // ── Invite: no confession at all ───────────────────────────────────────────
  if (share.bucket === 'invite' || (!share.confession_id && !share.question_id)) {
    await recordOpen();
    return json({ kind: 'invite' });
  }

  // ── Question ───────────────────────────────────────────────────────────────
  if (share.question_id) {
    const { data: q } = await supabase
      .from('questions')
      .select('text, status, starts_on')
      .eq('id', share.question_id)
      .maybeSingle();

    if (!q || q.status !== 'approved') return json(GONE);
    await recordOpen();
    return json({ kind: 'question', question: q.text });
  }

  // ── A confession ───────────────────────────────────────────────────────────
  const { data: c } = await supabase
    .from('confessions')
    .select('id, text, status, categories, source, auto_flagged, real_felt_count')
    .eq('id', share.confession_id)
    .maybeSingle();

  if (!c) return json(GONE);

  // Re-checked on EVERY visit, not at share time: a confession removed an hour
  // ago must stop being readable through a link shared last week.
  if (c.status !== 'live' && c.status !== 'approved') return json(GONE);
  if (c.auto_flagged) return json(GONE);
  // Generated and seed content never gets a page. The doorway says "someone
  // felt this" — there is no someone.
  if (c.source !== 'user') return json(GONE);

  const { data: reported } = await supabase
    .from('reports').select('id').eq('confession_id', c.id).limit(1).maybeSingle();
  if (reported) return json(GONE);

  const cat = CATEGORIES[(c.categories as string[])?.[0] ?? ''] ?? null;

  /**
   * HUMAN-only. real_felt_count is column-REVOKEd from clients and readable
   * here only because this runs with the service role. felt_count would
   * include fabricated seed values and generated-companion increments, and
   * this number is printed under someone's words as a claim about people.
   */
  const felt = typeof c.real_felt_count === 'number' ? c.real_felt_count : 0;

  await recordOpen();

  // Sealed unless the sharer chose to include the words, decided at share time.
  if (!share.words_included) {
    return json({
      kind:     'sealed',
      category: cat?.label ?? null,
      color:    cat?.color ?? null,
      felt:     felt > 0 ? felt : null,
    });
  }

  return json({
    kind:     'feeling',
    text:     c.text,
    category: cat?.label ?? null,
    color:    cat?.color ?? null,
    felt:     felt > 0 ? felt : null,
  });
});
