/**
 * Edge Function: send-support-message
 *
 * Saves the support message to the support_messages table (service_role)
 * and forwards it to support@soulyap.com via Resend.
 *
 * Required env vars:
 *   RESEND_API_KEY  — from resend.com dashboard
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY       = Deno.env.get('RESEND_API_KEY');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const jwt = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!jwt) return json({ error: 'unauthorized' }, 401);

    const anonClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(jwt);
    if (authErr || !user) return json({ error: 'unauthorized' }, 401);

    // ── Payload ───────────────────────────────────────────────────────────────
    const { email, message } = await req.json();

    if (!email?.trim() || !message?.trim()) {
      return json({ error: 'email and message are required' }, 400);
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── Save to DB ────────────────────────────────────────────────────────────
    await db.from('support_messages').insert({
      account_id: user.id,
      email:      email.trim(),
      message:    message.trim(),
    });

    // ── Send email via Resend ─────────────────────────────────────────────────
    if (RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          from:    'soulyap support <noreply@soulyap.com>',
          to:      ['support@soulyap.com'],
          reply_to: email.trim(),
          subject: `Support request from ${email.trim()}`,
          text:    `From: ${email.trim()}\nAccount: ${user.id}\n\n${message.trim()}`,
        }),
      });
    } else {
      console.warn('[send-support-message] RESEND_API_KEY not set — message saved to DB only');
    }

    return json({ ok: true });
  } catch (err) {
    console.error('[send-support-message]', err);
    return json({ error: 'internal error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
