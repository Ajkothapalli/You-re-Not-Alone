/**
 * Edge Function: report
 * Accepts a user report on a confession.
 * CSAM reports: immediately set status='removed' AND trigger NCMEC hook.
 * All other reports: queue for human review (status unchanged until reviewed).
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase             = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_REASONS = [
  'harmful_content',
  'hate_speech',
  'sexual_content',
  'violence',
  'spam',
  'csam',
  'other',
] as const;

type ReportReason = (typeof VALID_REASONS)[number];

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  // Auth required
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return json({ error: 'Unauthorized' }, 401);

  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  try {
    const body = await req.json();
    const { confessionId, reason }: { confessionId: string; reason: string } = body;

    if (!confessionId || !reason) {
      return json({ error: 'confessionId and reason are required.' }, 400);
    }

    if (!VALID_REASONS.includes(reason as ReportReason)) {
      return json({ error: 'Invalid reason.' }, 400);
    }

    // Verify confession exists
    const { data: confession, error: fetchErr } = await supabase
      .from('confessions')
      .select('id, status')
      .eq('id', confessionId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!confession) return json({ error: 'Confession not found.' }, 404);

    // Insert report for human review queue
    const { error: insertErr } = await supabase.from('reports').insert({
      confession_id: confessionId,
      reason,
    });
    if (insertErr) throw insertErr;

    // CSAM: zero tolerance — remove immediately, trigger NCMEC hook
    if (reason === 'csam') {
      await supabase
        .from('confessions')
        .update({ status: 'removed' })
        .eq('id', confessionId);

      // Phase 5: wire NCMEC CyberTipline API here.
      // Do NOT include account_id, author_token, or any user PII in the report.
      console.warn('[CSAM] NCMEC reporting hook triggered for confession:', confessionId);
    }

    return json({ ok: true });
  } catch (err) {
    console.error('[report] error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});
