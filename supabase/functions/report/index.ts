/**
 * Edge Function: report
 *
 * Files a user report on a confession.
 * - CSAM: removes immediately + mandatory NCMEC CyberTipline report.
 * - All reports: queued for human review + operator alert webhook fired.
 *
 * OPERATOR ALERT: set REPORT_WEBHOOK_URL as an Edge Function secret.
 * Works with Slack, Discord, or any JSON webhook. Format is Slack-compatible.
 *
 * NCMEC: set NCMEC_ESP_ID + NCMEC_API_KEY after completing the ESP agreement.
 * In production without those keys the function throws — reports still block
 * the content but the legal filing obligation is unmet. Complete the agreement
 * before launch (see STORE_COMPLIANCE.md).
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const NCMEC_ESP_ID         = Deno.env.get('NCMEC_ESP_ID')  ?? '';
const NCMEC_API_KEY        = Deno.env.get('NCMEC_API_KEY') ?? '';
const REPORT_WEBHOOK_URL   = Deno.env.get('REPORT_WEBHOOK_URL') ?? '';
const ENVIRONMENT          = Deno.env.get('ENVIRONMENT') ?? 'development';
const IS_PRODUCTION        = ENVIRONMENT === 'production';

// Confirmed by NCMEC after ESP agreement — update once you have the real endpoint.
const NCMEC_API_URL = 'https://api.cybertipline.org/api/v2/reports';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_REASONS = [
  'harmful_content', 'hate_speech', 'sexual_content',
  'violence', 'spam', 'csam', 'other',
] as const;

type ReportReason = typeof VALID_REASONS[number];

// ── NCMEC mandatory report ────────────────────────────────────────────────────
// Called when a user reports content as CSAM (post-write detection).
// The content was not caught at submission time; it is now status='removed'.
// Invariant: no account_id, no author_token, no user PII in the report body.

async function fileNcmecReport(confessionId: string): Promise<void> {
  const timestamp = new Date().toISOString();

  if (!NCMEC_ESP_ID || !NCMEC_API_KEY) {
    const msg = `[CSAM] NCMEC credentials not set — mandatory report NOT filed. confessionId=${confessionId} timestamp=${timestamp}`;
    if (IS_PRODUCTION) {
      // Legal obligation unmet — surface this in Supabase logs immediately.
      // Content is still removed; this throw is a compliance alert, not a user-facing error.
      throw new Error(msg);
    }
    console.error(msg);
    console.error('[CSAM] Complete the NCMEC ESP registration before production launch.');
    return;
  }

  const res = await fetch(NCMEC_API_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${NCMEC_API_KEY}`,
    },
    body: JSON.stringify({
      espId:        NCMEC_ESP_ID,
      reportedAt:   timestamp,
      incidentType: 'CSAM',
      contentType:  'text/user-reported',
      platformName: 'soulyap',
      // No account_id, no author_token, no confession text — ever.
      // The confessionId allows NCMEC to request content via legal process.
      referenceId:  confessionId,
    }),
  });

  if (!res.ok) {
    throw new Error(`[CSAM] NCMEC API ${res.status} — report not filed. confessionId=${confessionId} timestamp=${timestamp}`);
  }

  console.error(`[CSAM] NCMEC report filed. confessionId=${confessionId} timestamp=${timestamp}`);
}

// ── Operator alert ────────────────────────────────────────────────────────────
// Fires on every new report. Non-blocking (failure is logged, not thrown).
// Set REPORT_WEBHOOK_URL to a Slack, Discord, or Make/Zapier webhook.
// Never includes confession text or author identity.

async function alertOperator(
  reportId:     string,
  confessionId: string,
  reason:       string,
): Promise<void> {
  if (!REPORT_WEBHOOK_URL) return;

  const urgency  = reason === 'csam' ? '🚨 URGENT' : '⚠️  Review needed';
  const deadline = reason === 'csam' ? 'Remove immediately + NCMEC filed' : 'Review within 24h';

  const payload = {
    // Slack-compatible format (works with Discord, Make, Zapier too)
    text: `${urgency}: New report on soulyap`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `*${urgency}: New report filed*`,
            `*Reason:* \`${reason}\``,
            `*Action:* ${deadline}`,
            `*Report ID:* \`${reportId}\``,
            `*Confession ID:* \`${confessionId}\``,
            `*Reported at:* ${new Date().toISOString()}`,
            '',
            '*Quick remove (run in Supabase Studio SQL editor):*',
            `\`\`\`SELECT admin_remove_confession('${confessionId}');\`\`\``,
            '',
            'Or view full queue: `SELECT * FROM operator_reports;`',
          ].join('\n'),
        },
      },
    ],
  };

  const res = await fetch(REPORT_WEBHOOK_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error(`[ALERT] Webhook ${res.status} — report ${reportId} not alerted`);
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  // Authenticated users only
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

    // Verify the confession exists and is accessible
    const { data: confession, error: fetchErr } = await supabase
      .from('confessions')
      .select('id, status')
      .eq('id', confessionId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!confession) return json({ error: 'Confession not found.' }, 404);

    // Insert report
    const { data: report, error: insertErr } = await supabase
      .from('reports')
      .insert({ confession_id: confessionId, reason })
      .select('id')
      .single();

    if (insertErr) throw insertErr;

    const reportId = report.id;

    // CSAM: zero-tolerance — remove immediately + mandatory NCMEC report.
    // Content is never shown again after status='removed'.
    if (reason === 'csam') {
      await supabase
        .from('confessions')
        .update({ status: 'removed' })
        .eq('id', confessionId);

      // This throws in production if NCMEC credentials are not set.
      // The 500 response surfaces the missing setup obligation.
      await fileNcmecReport(confessionId);
    }

    // Operator alert — non-blocking; failure is logged but never fails the report.
    alertOperator(reportId, confessionId, reason).catch((err) => {
      console.error('[ALERT] operator notification failed:', err?.message ?? err);
    });

    return json({ ok: true, reportId });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[report] error:', msg);
    return json({ error: 'Internal server error' }, 500);
  }
});
