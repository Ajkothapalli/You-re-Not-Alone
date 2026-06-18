/**
 * Edge Function: improve-writing
 *
 * A drafting aid — rewrites a confession to read more clearly while
 * preserving the writer's voice, meaning, rawness, and length. It NEVER
 * stores anything; the real safety pipeline still runs on submit.
 *
 * Safety gates run BEFORE any rewrite (so the AI never polishes harmful or
 * crisis content):
 *   [0] Auth
 *   [1] CRISIS CHECK  → return {type:'crisis'}; do NOT improve. Client routes
 *                       to /crisis. We never "tidy up" a crisis note.
 *   [2] MODERATION    → return {type:'blocked'}; do NOT improve.
 *   [3] IMPROVE       → gpt-4o-mini rewrite, returns {type:'improved', text}.
 *
 * No key + production → fail closed (500). No key + dev → returns the text
 * unchanged with preview:true so the UI flow can be tested.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_API_KEY       = Deno.env.get('OPENAI_API_KEY');
const MODERATION_API_KEY   = Deno.env.get('MODERATION_API_KEY');
const ENVIRONMENT          = Deno.env.get('ENVIRONMENT') ?? 'development';
const IS_PRODUCTION        = ENVIRONMENT === 'production';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CRISIS_KEYWORDS = [
  'kill myself', 'killing myself', 'end my life', 'take my life', 'take my own life',
  'suicide', 'suicidal', 'want to die', 'want to be dead', 'better off dead',
  'hurt myself', 'self harm', 'self-harm', 'cut myself', 'cutting myself',
  'overdose', 'no reason to live', 'not worth living', 'nothing to live for',
  "can't go on", 'cant go on', "can't take it anymore", 'end it all',
  "don't want to live", 'being abused', 'no way out',
];

async function isCrisis(text: string): Promise<boolean> {
  const lower = text.toLowerCase();
  if (CRISIS_KEYWORDS.some((kw) => lower.includes(kw))) return true;
  if (!OPENAI_API_KEY) return false;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini', temperature: 0, max_tokens: 5,
        messages: [
          { role: 'system', content: 'You are a crisis detection classifier. Respond with only YES or NO. Respond YES if the text contains suicidal ideation, self-harm, abuse, or serious immediate distress. When uncertain, respond YES. Never explain.' },
          { role: 'user', content: text },
        ],
      }),
    });
    if (!res.ok) return false; // fail open — keyword list already ran
    const data = await res.json();
    return (data.choices?.[0]?.message?.content ?? '').trim().toUpperCase() === 'YES';
  } catch {
    return false;
  }
}

async function isBlocked(text: string): Promise<boolean> {
  if (!MODERATION_API_KEY) return false; // moderation re-runs on submit regardless
  const res = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MODERATION_API_KEY}` },
    body: JSON.stringify({ model: 'omni-moderation-latest', input: text }),
  });
  if (!res.ok) throw new Error(`moderation ${res.status}`);
  const data = await res.json();
  return data.results?.[0]?.flagged === true;
}

const IMPROVE_SYSTEM = [
  'You help someone privately put painful, personal feelings into clearer words.',
  "Rewrite the user's confession so it reads more clearly and flows better, while STRICTLY preserving:",
  'their first-person voice, their exact meaning, their raw honesty and emotion, and roughly their length.',
  "Do NOT add facts, advice, comfort, or details they didn't write.",
  'Do NOT soften, sanitize, or moralize difficult emotions.',
  'Do NOT make it sound generic or corporate. Keep it human and specific to them.',
  'Output ONLY the rewritten confession — no preamble, no quotation marks, no notes.',
].join(' ');

async function improve(text: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.5,
      max_tokens: 800,
      messages: [
        { role: 'system', content: IMPROVE_SYSTEM },
        { role: 'user', content: text },
      ],
    }),
  });
  if (!res.ok) throw new Error(`improve ${res.status}`);
  const data = await res.json();
  const out = (data.choices?.[0]?.message?.content ?? '').trim();
  if (!out) throw new Error('improve returned empty');
  return out;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return json({ error: 'Unauthorized' }, 401);
  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  let body: { text?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const text = (body.text ?? '').trim();
  if (text.length < 10)   return json({ error: 'Write a little more first.' }, 400);
  if (text.length > 2000) return json({ error: 'Too long to improve (max 2000 characters).' }, 400);

  try {
    // [1] Crisis — never polish a crisis note; route to support instead.
    if (await isCrisis(text)) return json({ type: 'crisis' });

    // [2] Moderation
    if (await isBlocked(text)) return json({ type: 'blocked' });

    // [3] Improve
    if (!OPENAI_API_KEY) {
      if (IS_PRODUCTION) throw new Error('OPENAI_API_KEY not set in production');
      return json({ type: 'improved', text, preview: true });
    }
    const improved = await improve(text);
    return json({ type: 'improved', text: improved });

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Improve failed';
    console.error('[improve-writing]', msg);
    return json({ error: 'Could not improve the writing right now.' }, 500);
  }
});
