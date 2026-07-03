/**
 * seed-match-pool.ts
 *
 * One-time script: embeds every confession in lib/dummyConfessions.ts using
 * text-embedding-3-small and inserts them into the confessions table with
 * is_seed = true, so new writers get matched on day one (cold-start bootstrap).
 *
 * Run:
 *   SUPABASE_URL=...  SUPABASE_SERVICE_ROLE_KEY=...  EMBEDDING_API_KEY=...  \
 *   npx tsx scripts/seed-match-pool.ts
 *
 * Add --force to wipe and re-insert existing seeds.
 *
 * Safety:
 *   - Seeds are operator-curated and pre-vetted — they do NOT go through the
 *     public submit pipeline (no moderation call, no crisis check, no rate limit).
 *   - The public safety pipeline for real users is completely unchanged.
 *   - SEED_AUTHOR_TOKEN is a fixed non-HMAC string that can never collide with
 *     a real user's author_token (which is HMAC-SHA256(account_id, secret)).
 *   - Seeds are excluded from DSAR deletes (they have no account_id).
 *
 * Retirement:
 *   DELETE FROM confessions WHERE is_seed = true;
 */

import { createClient } from '@supabase/supabase-js';
import { DUMMY_CONFESSIONS } from '../lib/dummyConfessions';

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL             = process.env.SUPABASE_URL             ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const EMBEDDING_API_KEY         = process.env.EMBEDDING_API_KEY         ?? '';
const FORCE                     = process.argv.includes('--force');

// Fixed token for all seeds. Not a real HMAC — the prefix 'seed:' makes it
// structurally distinct from any HMAC-SHA256 output (hex, 64 chars).
const SEED_AUTHOR_TOKEN = 'seed:soulyap:v1';

// text-embedding-3-small → 1536 dims (matches confessions.embedding column)
const EMBED_MODEL   = 'text-embedding-3-small';
const EMBED_URL     = 'https://api.openai.com/v1/embeddings';
const BATCH_SIZE    = 20;   // texts per OpenAI request
const DELAY_MS      = 300;  // ms between batches to stay within rate limits

// ── Guards ────────────────────────────────────────────────────────────────────

function assertEnv() {
  const missing = [
    !SUPABASE_URL             && 'SUPABASE_URL',
    !SUPABASE_SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
    !EMBEDDING_API_KEY         && 'EMBEDDING_API_KEY',
  ].filter(Boolean);
  if (missing.length) {
    console.error(`Missing env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
}

// ── Embedding ─────────────────────────────────────────────────────────────────

async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await fetch(EMBED_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${EMBEDDING_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embeddings error ${res.status}: ${err}`);
  }
  const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
  // Sort by index to preserve order (OpenAI guarantees order, but be safe).
  return json.data
    .sort((a, b) => a.index - b.index)
    .map(d => d.embedding);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  assertEnv();

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Check for existing seeds
  const { count, error: countErr } = await supabase
    .from('confessions')
    .select('*', { count: 'exact', head: true })
    .eq('is_seed', true);

  if (countErr) {
    console.error('Could not check existing seeds:', countErr.message);
    process.exit(1);
  }

  if ((count ?? 0) > 0) {
    if (!FORCE) {
      console.log(`\n⚠  ${count} seed rows already exist. Pass --force to wipe and re-seed.\n`);
      process.exit(0);
    }
    console.log(`--force: deleting ${count} existing seeds…`);
    const { error: delErr } = await supabase
      .from('confessions')
      .delete()
      .eq('is_seed', true);
    if (delErr) {
      console.error('Delete failed:', delErr.message);
      process.exit(1);
    }
    console.log('Existing seeds deleted.\n');
  }

  const total = DUMMY_CONFESSIONS.length;
  console.log(`Seeding ${total} confessions (${EMBED_MODEL}, batch=${BATCH_SIZE})…\n`);

  let inserted = 0;
  let failed   = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = DUMMY_CONFESSIONS.slice(i, i + BATCH_SIZE);
    const texts = batch.map(c => c.text);

    process.stdout.write(
      `  [${i + 1}–${Math.min(i + BATCH_SIZE, total)}/${total}] embedding… `,
    );

    let embeddings: number[][];
    try {
      embeddings = await embedBatch(texts);
    } catch (err: any) {
      console.error(`\nEmbed error: ${err.message}`);
      failed += batch.length;
      continue;
    }

    process.stdout.write('inserting… ');

    const rows = batch.map((c, j) => ({
      text:         c.text,
      embedding:    `[${embeddings[j].join(',')}]`,  // pgvector literal format
      categories:   c.categories as string[],
      felt_count:   c.feltCount,
      status:       'live',
      author_token: SEED_AUTHOR_TOKEN,
      is_seed:      true,
    }));

    const { error: insertErr } = await supabase.from('confessions').insert(rows);
    if (insertErr) {
      console.error(`\nInsert error: ${insertErr.message}`);
      failed += batch.length;
    } else {
      inserted += batch.length;
      console.log('✓');
    }

    if (i + BATCH_SIZE < total) await sleep(DELAY_MS);
  }

  console.log(`\n✅  Done — ${inserted} inserted, ${failed} failed.\n`);

  if (inserted > 0) {
    // Verify a sample category
    const { data: sample } = await supabase
      .from('confessions')
      .select('id, categories, felt_count')
      .eq('is_seed', true)
      .limit(3);
    console.log('Sample rows:');
    sample?.forEach(r =>
      console.log(`  ${r.id}  [${r.categories.join(', ')}]  felt=${r.felt_count}`),
    );
    console.log();
  }

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
