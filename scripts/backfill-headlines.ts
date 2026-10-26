/**
 * backfill-headlines.ts
 *
 * [H1] Gives a headline to live confessions that predate the feature.
 *
 * Run (DEV):
 *   SUPABASE_URL=https://tmpqadweifuwbmktbmzg.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... OPENAI_API_KEY=... \
 *   npx tsx scripts/backfill-headlines.ts --dry-run
 *
 * Drop --dry-run to write. Add --limit=N to cap a run.
 *
 * ── What it will and will not touch ─────────────────────────────────────────
 * Rows with status 'live' or 'approved' and headline IS NULL. Real and
 * curated both, as specified — a curated confession showing no headline
 * beside real ones that have them would mark it out as different, and
 * `source` is hidden from readers by design (CLAUDE.md invariant 3).
 *
 * It never touches text, never touches any other column, and never touches a
 * row that already has a headline — including one the writer has deliberately
 * removed. That last one matters: "headline IS NULL" is the same state for
 * "never had one" and "the writer took theirs away", so a backfill that
 * re-ran over everything would silently overturn a person's decision about
 * their own words. It cannot be distinguished here, which is exactly why this
 * is a one-time backfill and not a periodic job. Do not put it on a cron.
 *
 * ── Resumable, and it has to page on a CURSOR ───────────────────────────────
 * "headline IS NULL" alone is not enough to page on, and assuming it was
 * hung the first DEV run in an infinite loop. Most short confessions get NO
 * headline by design (MIN_TEXT_WORDS), so they stay NULL after being
 * processed and the very same page comes back every time — 21 of the 24
 * eligible DEV rows, forever, at one OpenAI call each.
 *
 * So it pages on a (created_at, id) cursor, which advances whatever the
 * outcome was. Across RUNS, "headline IS NULL" still does the resuming: a
 * rerun starts at the beginning, skips everything that got one, and redoes
 * the cheap short rows that never will.
 *
 * ── Nothing is logged ───────────────────────────────────────────────────────
 * Not in the writing path. --dry-run DOES print ids and headlines, because
 * its entire purpose is for a human to read them before anything is written,
 * and a headline is a substring of a confession that is already public. It
 * still never prints the confession text.
 */

import { createClient } from '@supabase/supabase-js';
import { pickHeadline } from '../supabase/functions/_shared/headline';

// ── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY   = process.env.OPENAI_API_KEY ?? null;

const DRY_RUN     = process.argv.includes('--dry-run');
const LIMIT_ARG   = process.argv.find((a) => a.startsWith('--limit='));
const HARD_LIMIT  = LIMIT_ARG ? Number(LIMIT_ARG.split('=')[1]) : Infinity;

const BATCH = 50;
/**
 * Between batches, not between rows.
 *
 * Fifty gpt-4o-mini calls land together and then the script waits. That is
 * gentle on the rate limit without turning a few thousand rows into an hour
 * of sleeping, and — more to the point — this runs against the same API key
 * the LIVE submit path uses. A backfill that saturated the quota would make
 * every real person posting during the run get the fallback instead.
 */
const PAUSE_MS = 1_200;
/** Printed for review by --dry-run. */
const SAMPLE_N = 30;

/**
 * How many rows call the API at once.
 *
 * NOT the batch size. Fifty simultaneous requests on a cold connection all
 * miss their timeout together — measured on DEV, a first run produced ZERO
 * model headlines and fifty fallbacks, which looks exactly like "the model
 * is useless here" and is really just TLS setup plus contention.
 */
const CONCURRENCY = 6;

/**
 * The backfill gets a longer leash than the live path, deliberately.
 *
 * HEADLINE_TIMEOUT_MS (1.5s) exists because a person is standing there
 * waiting for their confession to post. Nobody is waiting on this script, so
 * inheriting that budget buys nothing and costs real headlines: measured
 * end-to-end latency is 0.7-1.6s, so 1.5s sits right on the tail and turns a
 * slow second into a permanent fallback for that row — a row nothing will
 * ever revisit, because the next run skips anything that has a headline.
 */
const BACKFILL_TIMEOUT_MS = 8_000;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}
if (!OPENAI_KEY) {
  // Not fatal: without a key every row gets the opening-words fallback, which
  // is a legitimate outcome. Worth being loud about, because a whole backfill
  // of fallbacks is probably not what anybody intended.
  console.warn('⚠  OPENAI_API_KEY is not set — every row will get the fallback headline.');
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Row { id: string; text: string; created_at: string }

// ── Run ──────────────────────────────────────────────────────────────────────

async function main() {
  const host = new URL(SUPABASE_URL!).host;
  console.log(`\n${DRY_RUN ? 'DRY RUN' : 'WRITING'} · ${host}`);
  if (host.startsWith('sjywjerlqxwfniwqjojs')) {
    console.log('⚠  This is the PRODUCTION project.');
  }

  const totals = { seen: 0, model: 0, fallback: 0, none: 0, failed: 0 };
  const samples: { id: string; headline: string | null; source: string }[] = [];

  /** (created_at, id) of the last row processed. See the header. */
  let cursor: { at: string; id: string } | null = null;

  for (;;) {
    if (totals.seen >= HARD_LIMIT) break;

    const pageSize = Math.min(BATCH, HARD_LIMIT - totals.seen);
    let query = supabase
      .from('confessions')
      .select('id, text, created_at')
      .in('status', ['live', 'approved'])
      .is('headline', null)
      // Oldest first, so an interrupted run leaves a contiguous done/not-done
      // boundary rather than holes scattered through the table.
      .order('created_at', { ascending: true })
      // id breaks ties. Without it, a batch whose rows share one timestamp
      // would never advance past itself — the same hang in a rarer shape.
      .order('id', { ascending: true })
      .limit(pageSize);

    if (cursor) {
      query = query.or(
        `created_at.gt.${cursor.at},and(created_at.eq.${cursor.at},id.gt.${cursor.id})`,
      );
    }

    const { data, error } = await query;

    if (error) { console.error('query failed:', error.message); process.exit(1); }

    const rows = (data ?? []) as Row[];
    if (rows.length === 0) break;
    const last = rows[rows.length - 1];
    cursor = { at: last.created_at, id: last.id };

    // In slices of CONCURRENCY rather than all at once — see its note.
    // pickHeadline never throws, so one bad row cannot take a slice down.
    const picked: { row: Row; result: Awaited<ReturnType<typeof pickHeadline>> }[] = [];
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      const slice = rows.slice(i, i + CONCURRENCY);
      picked.push(...await Promise.all(slice.map(async (row) => ({
        row,
        result: await pickHeadline(row.text, {
          apiKey: OPENAI_KEY, timeoutMs: BACKFILL_TIMEOUT_MS,
        }),
      }))));
    }

    for (const { row, result } of picked) {
      totals.seen++;
      totals[result.source]++;
      if (samples.length < SAMPLE_N) {
        samples.push({ id: row.id, headline: result.headline, source: result.source });
      }

      if (DRY_RUN || result.headline === null) continue;

      const { error: upErr } = await supabase
        .from('confessions')
        .update({ headline: result.headline })
        .eq('id', row.id)
        // Belt and braces against a concurrent write, and what keeps a
        // re-run from overturning a headline the writer removed while this
        // was running.
        .is('headline', null);

      if (upErr) { totals.failed++; console.error(`  ${row.id}: ${upErr.message}`); }
    }

    // A dry run must not loop forever: nothing is written, so the same page
    // comes back every time.
    if (DRY_RUN) break;

    process.stdout.write(`\r  ${totals.seen} done…`);
    await sleep(PAUSE_MS);
  }

  console.log('\n');
  if (DRY_RUN) {
    console.log(`── ${samples.length} samples ${'─'.repeat(52)}`);
    for (const s of samples) {
      const tag = s.source === 'model' ? 'model   ' : s.source === 'fallback' ? 'fallback' : 'none    ';
      console.log(`${tag}  ${s.id}  ${s.headline ?? '(no headline)'}`);
    }
    console.log('─'.repeat(72));
    console.log('\nNothing was written. Drop --dry-run to apply.');
  }

  console.log(
    `\nseen ${totals.seen} · model ${totals.model} · fallback ${totals.fallback}`
    + ` · none ${totals.none} · failed ${totals.failed}`,
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
