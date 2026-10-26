/**
 * Edge Function: send-pushes
 *
 * [N1] Drains push_outbox. Cron every 10 minutes.
 *
 * Every decision about WHETHER and WHEN lives in _shared/pushRules.ts, which
 * is pure and directly tested. This file is the plumbing around it: read the
 * due rows, find each account's devices, apply the verdict, talk to Expo,
 * write back what happened.
 *
 * ── Two invocations ─────────────────────────────────────────────────────────
 *   POST { task: 'send'     }  — the 10-minute drain (default)
 *   POST { task: 'receipts' }  — ~15 minutes later, checks tickets
 *   POST { task: 'question' }  — hourly, enqueues Monday's question
 *
 * ── Logs carry counts only ──────────────────────────────────────────────────
 * No token, no account id, no confession id, no body text. A log line that
 * paired an account with a confession would be the authorship link
 * CLAUDE.md #3 forbids, written somewhere nobody thinks to look.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';
import {
  decidePush, buildData, isQuestionHour, isoWeekKey, QUESTION_ACTIVE_DAYS,
  type DeviceRow, type OutboxRow,
} from '../_shared/pushRules.ts';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET          = Deno.env.get('SEED_CRON_SECRET') ?? '';
/**
 * Optional. Expo accepts unauthenticated pushes; the token raises the rate
 * limit and is required once "enhanced security" is switched on for the
 * project. A missing one must NOT stop sending — see the header of the
 * batch sender.
 */
const EXPO_ACCESS_TOKEN    = Deno.env.get('EXPO_ACCESS_TOKEN') ?? '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const EXPO_SEND     = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS = 'https://exp.host/--/api/v2/push/getReceipts';
/** Expo's documented maximum per request. */
const BATCH = 100;
/** How many outbox rows one invocation will attempt. */
const MAX_PER_RUN = 500;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });

function expoHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type':     'application/json',
    'Accept':           'application/json',
    'Accept-Encoding':  'gzip, deflate',
  };
  if (EXPO_ACCESS_TOKEN) h.Authorization = `Bearer ${EXPO_ACCESS_TOKEN}`;
  return h;
}

interface ExpoMessage {
  to:       string;
  title:    string;
  body:     string;
  data:     { route: string };
  channelId: string;
  sound:    null;
}

// ─── The drain ───────────────────────────────────────────────────────────────

async function runSend(now: Date) {
  const { data: due } = await supabase
    .from('push_outbox')
    .select('id, account_id, kind, counts, not_before')
    .eq('status', 'pending')
    .lte('not_before', now.toISOString())
    .order('not_before', { ascending: true })
    .limit(MAX_PER_RUN);

  const rows = (due ?? []) as OutboxRow[];
  if (rows.length === 0) return { considered: 0, sent: 0, deferred: 0, skipped: 0 };

  // The live question, fetched once rather than per row.
  let questionText: string | null = null;
  if (rows.some((r) => r.kind === 'question')) {
    try {
      const { data } = await supabase.rpc('current_question');
      const q = Array.isArray(data) ? data[0] : data;
      questionText = (q as { text?: string } | null)?.text ?? null;
    } catch { questionText = null; }
  }

  const accountIds = [...new Set(rows.map((r) => r.account_id))];

  const { data: deviceRows } = await supabase
    .from('push_devices')
    .select('account_id, expo_token, tz, discreet, quiet_hours, felt_on, question_on, disabled_at')
    .in('account_id', accountIds)
    .is('disabled_at', null);

  const byAccount = new Map<string, (DeviceRow & { account_id: string })[]>();
  for (const d of (deviceRows ?? []) as (DeviceRow & { account_id: string })[]) {
    const list = byAccount.get(d.account_id) ?? [];
    list.push(d);
    byAccount.set(d.account_id, list);
  }

  /**
   * How many have already gone to each account today.
   *
   * Counted over the last 24 hours rather than a calendar day. A calendar
   * day needs the account's timezone, and an account can have devices in
   * two of them — at which point "today" is ambiguous and a rolling window
   * is both simpler and stricter.
   */
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data: sentRows } = await supabase
    .from('push_outbox')
    .select('account_id')
    .eq('status', 'sent')
    .gte('sent_at', since)
    .in('account_id', accountIds);

  const sentToday = new Map<string, number>();
  for (const r of (sentRows ?? []) as { account_id: string }[]) {
    sentToday.set(r.account_id, (sentToday.get(r.account_id) ?? 0) + 1);
  }

  const messages: ExpoMessage[] = [];
  const sending: string[] = [];         // outbox ids going out this run
  const deferring: { id: string; at: string }[] = [];
  const skipping: string[] = [];

  for (const row of rows) {
    const devices = byAccount.get(row.account_id) ?? [];
    if (devices.length === 0) { skipping.push(row.id); continue; }

    let anySent = false;
    let earliestDefer: Date | null = null;

    for (const d of devices) {
      const verdict = decidePush({
        row, device: d, sentToday: sentToday.get(row.account_id) ?? 0,
        questionText, now,
      });

      if (verdict.action === 'send') {
        messages.push({
          to:        d.expo_token,
          title:     verdict.title,
          body:      verdict.body,
          data:      buildData(row.kind),
          channelId: 'soulyap',
          sound:     null,
        });
        anySent = true;
      } else if (verdict.action === 'defer') {
        if (!earliestDefer || verdict.notBefore < earliestDefer) {
          earliestDefer = verdict.notBefore;
        }
      }
    }

    // A row is SENT if it reached any device, DEFERRED if every device said
    // "later", and SKIPPED if every device said "never". Marking a row sent
    // when one of two phones was asleep would lose it for the other.
    if (anySent) {
      sending.push(row.id);
      sentToday.set(row.account_id, (sentToday.get(row.account_id) ?? 0) + 1);
    } else if (earliestDefer) {
      deferring.push({ id: row.id, at: earliestDefer.toISOString() });
    } else {
      skipping.push(row.id);
    }
  }

  const tickets = await sendToExpo(messages);

  if (sending.length) {
    await supabase.from('push_outbox')
      .update({ status: 'sent', sent_at: now.toISOString(), ticket_id: tickets.join(',') || null })
      .in('id', sending);
  }
  for (const d of deferring) {
    await supabase.from('push_outbox').update({ not_before: d.at }).eq('id', d.id);
  }
  if (skipping.length) {
    await supabase.from('push_outbox').update({ status: 'skipped' }).in('id', skipping);
  }

  return {
    considered: rows.length, sent: sending.length,
    deferred: deferring.length, skipped: skipping.length,
  };
}

/**
 * Send in batches of 100, and collect the ticket ids.
 *
 * A failure here is logged as a count and the rows stay pending, so the
 * next run retries. Nothing throws out of this: one bad batch must not
 * abandon the rest of the queue.
 */
async function sendToExpo(messages: ExpoMessage[]): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < messages.length; i += BATCH) {
    const chunk = messages.slice(i, i + BATCH);
    try {
      const res = await fetch(EXPO_SEND, {
        method: 'POST', headers: expoHeaders(), body: JSON.stringify(chunk),
      });
      if (!res.ok) { console.error(`[push] expo send failed status=${res.status} n=${chunk.length}`); continue; }
      const body = await res.json() as { data?: { status: string; id?: string; details?: { error?: string } }[] };
      for (let j = 0; j < (body.data ?? []).length; j++) {
        const t = body.data![j];
        if (t.status === 'ok' && t.id) ids.push(t.id);
        // An immediate DeviceNotRegistered comes back here rather than in a
        // receipt, and the token is dead either way.
        if (t.details?.error === 'DeviceNotRegistered') {
          await disableToken(chunk[j].to);
        }
      }
    } catch {
      console.error(`[push] expo send threw n=${chunk.length}`);
    }
  }
  return ids;
}

async function disableToken(token: string): Promise<void> {
  // The token itself is never logged — it identifies a device.
  await supabase.from('push_devices')
    .update({ disabled_at: new Date().toISOString() })
    .eq('expo_token', token);
}

// ─── Receipts ────────────────────────────────────────────────────────────────

/**
 * Expo accepts a push and tells you later whether the platform took it.
 * DeviceNotRegistered means the app was uninstalled or the token rotated;
 * continuing to send to it eventually gets the project rate-limited.
 */
async function runReceipts(now: Date) {
  const since = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const { data: rows } = await supabase
    .from('push_outbox')
    .select('id, ticket_id')
    .eq('status', 'sent')
    .not('ticket_id', 'is', null)
    .gte('sent_at', since)
    .limit(MAX_PER_RUN);

  const ids = (rows ?? []).flatMap((r) => String(r.ticket_id ?? '').split(',').filter(Boolean));
  if (ids.length === 0) return { checked: 0, disabled: 0 };

  let disabled = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    try {
      const res = await fetch(EXPO_RECEIPTS, {
        method: 'POST', headers: expoHeaders(),
        body: JSON.stringify({ ids: ids.slice(i, i + BATCH) }),
      });
      if (!res.ok) continue;
      const body = await res.json() as {
        data?: Record<string, { status: string; details?: { error?: string; expoPushToken?: string } }>
      };
      for (const receipt of Object.values(body.data ?? {})) {
        if (receipt.details?.error === 'DeviceNotRegistered' && receipt.details.expoPushToken) {
          await disableToken(receipt.details.expoPushToken);
          disabled++;
        }
      }
    } catch { /* next run tries again */ }
  }
  return { checked: ids.length, disabled };
}

// ─── The weekly question ─────────────────────────────────────────────────────

/**
 * Hourly. Enqueues Monday's question for devices whose LOCAL time is
 * Monday 19:00–19:59.
 *
 * Runs hourly rather than once, because "Monday evening" is a different
 * instant in every timezone and a single daily job would reach half the
 * world at the wrong hour.
 */
async function runQuestion(now: Date) {
  const { data } = await supabase.rpc('current_question');
  const q = Array.isArray(data) ? data[0] : data;
  const question = q as { id?: string; text?: string } | null;
  // No live question means the bank has run out. Send nothing at all —
  // an empty push is worse than silence, and the dashboard's own warning
  // is what surfaces the empty bank.
  if (!question?.id) return { enqueued: 0, reason: 'no_live_question' };

  const activeSince = new Date(now.getTime() - QUESTION_ACTIVE_DAYS * 86400000).toISOString();
  const { data: devices } = await supabase
    .from('push_devices')
    .select('account_id, tz')
    .is('disabled_at', null)
    .eq('question_on', true)
    .gte('last_seen_at', activeSince);

  const week = isoWeekKey(now);
  const seen = new Set<string>();
  let enqueued = 0;

  for (const d of (devices ?? []) as { account_id: string; tz: string }[]) {
    if (!isQuestionHour(d.tz, now)) continue;
    if (seen.has(d.account_id)) continue;      // one per account, not per device
    seen.add(d.account_id);

    // Nobody is nudged about something they have already done.
    const { data: answered } = await supabase.rpc('has_answered_question', {
      p_account_id: d.account_id, p_question_id: question.id,
    });
    if (answered === true) continue;

    const { error } = await supabase.from('push_outbox').insert({
      account_id: d.account_id,
      kind:       'question',
      counts:     {},
      dedupe_key: `question:${d.account_id}:${week}`,
    });
    // A duplicate key means this week's push is already queued. Expected.
    if (!error) enqueued++;
  }

  return { enqueued, reason: null };
}

// ─── Entry ───────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  // Same shared secret the seed cron uses. Without it anybody could drain
  // the queue at a time of their choosing, which is a way to defeat quiet
  // hours from outside.
  const auth = req.headers.get('x-cron-secret') ?? '';
  if (!CRON_SECRET || auth !== CRON_SECRET) return json({ error: 'Forbidden.' }, 403);

  let body: { task?: string } = {};
  try { body = await req.json(); } catch { /* defaults to send */ }

  const now = new Date();
  try {
    if (body.task === 'receipts') {
      const r = await runReceipts(now);
      console.log(`[push] receipts checked=${r.checked} disabled=${r.disabled}`);
      return json(r);
    }
    if (body.task === 'question') {
      const r = await runQuestion(now);
      console.log(`[push] question enqueued=${r.enqueued}${r.reason ? ' reason=' + r.reason : ''}`);
      return json(r);
    }
    const r = await runSend(now);
    console.log(`[push] considered=${r.considered} sent=${r.sent} deferred=${r.deferred} skipped=${r.skipped}`);
    return json(r);
  } catch (e) {
    // The message only — never a row, never a token.
    console.error('[push] run failed:', (e as Error)?.message);
    return json({ error: 'send failed' }, 500);
  }
});
