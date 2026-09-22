/**
 * Edge Function: send-support-message
 *
 * Saves the support message to the support_messages table (service_role)
 * and forwards it by email via Resend.
 *
 * The DB write is the durable record; the email is a convenience. If Resend
 * is unconfigured or rejects the send, the message is still in
 * support_messages — check there before assuming a report was lost.
 *
 * Required env vars:
 *   RESEND_API_KEY  — from resend.com dashboard
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Overridable without a redeploy: set SUPPORT_EMAIL in the function secrets. */
const SUPPORT_EMAIL = Deno.env.get('SUPPORT_EMAIL') ?? 'nani.ajay@gmail.com';

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
          // `from` was noreply@soulyap.com — a domain with no MX record and,
          // as of 2026-09-22, not verified in Resend at all (the Domains tab
          // is empty). Resend rejects any send from an unverified domain, so
          // this failed regardless of the `to` address or the API key.
          //
          // onboarding@resend.dev is Resend's shared sender and needs no DNS.
          // Its restriction — it may only deliver to the Resend account's own
          // email — costs nothing here, because SUPPORT_EMAIL *is* that
          // address. Nobody but the recipient ever sees this From line.
          //
          // To send from soulyap: add the domain in Resend (soulyap.me, the
          // one that actually exists — NOT soulyap.com), publish the SPF/DKIM
          // records it gives you, then set RESEND_FROM in the function
          // secrets. No redeploy needed.
          from:    Deno.env.get('RESEND_FROM') ?? 'soulyap support <onboarding@resend.dev>',
          to:      [SUPPORT_EMAIL],
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
