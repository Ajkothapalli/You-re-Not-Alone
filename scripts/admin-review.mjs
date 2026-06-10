#!/usr/bin/env node
/**
 * admin-review — human review queue CLI
 *
 * SECURITY: uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS.
 * Run locally only. Never import this into the client bundle.
 *
 * Usage:
 *   node scripts/admin-review.mjs crisis
 *   node scripts/admin-review.mjs reports
 *   node scripts/admin-review.mjs resolve-crisis <id>
 *   node scripts/admin-review.mjs resolve-report <id>
 *   node scripts/admin-review.mjs resolve-report <id> --restore
 *
 * Env:
 *   SUPABASE_URL            — e.g. https://xyzxyz.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — from Supabase project settings
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    'Missing required env vars.\n' +
    '  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.\n' +
    '  Copy from your Supabase project settings — never commit these values.',
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const SEP = '─'.repeat(72);

function printUsage() {
  console.log(`
Usage:
  node scripts/admin-review.mjs crisis
  node scripts/admin-review.mjs reports
  node scripts/admin-review.mjs resolve-crisis   <uuid>
  node scripts/admin-review.mjs resolve-report   <uuid>
  node scripts/admin-review.mjs resolve-report   <uuid> --restore

Commands:
  crisis                    List unreviewed crisis events
  reports                   List unresolved reports
  resolve-crisis <id>       Mark a crisis event as reviewed
  resolve-report <id>       Resolve a report (confession remains removed)
  resolve-report <id>       Resolve and restore the confession to live
    --restore
`);
}

// ── crisis ────────────────────────────────────────────────────────────────────

async function listCrisis() {
  const { data, error } = await supabase
    .from('admin_pending_crisis')
    .select('*');

  if (error) {
    console.error('Error fetching crisis queue:', error.message);
    process.exit(1);
  }

  if (!data.length) {
    console.log('Crisis queue is empty. ✅');
    return;
  }

  console.log(`\n${data.length} unreviewed crisis event(s):\n`);
  for (const row of data) {
    console.log(`ID:       ${row.id}`);
    console.log(`Created:  ${new Date(row.created_at).toLocaleString()}`);
    console.log(`Text:     ${row.text}`);
    console.log(SEP);
  }
}

// ── reports ───────────────────────────────────────────────────────────────────

async function listReports() {
  const { data, error } = await supabase
    .from('admin_pending_reports')
    .select('*');

  if (error) {
    console.error('Error fetching reports queue:', error.message);
    process.exit(1);
  }

  if (!data.length) {
    console.log('Reports queue is empty. ✅');
    return;
  }

  console.log(`\n${data.length} unresolved report(s):\n`);
  for (const row of data) {
    console.log(`Report ID:     ${row.report_id}`);
    console.log(`Reported at:   ${new Date(row.reported_at).toLocaleString()}`);
    console.log(`Reason:        ${row.reason}`);
    console.log(`Confession ID: ${row.confession_id}`);
    console.log(`Status:        ${row.status}`);
    console.log(`Felt count:    ${row.felt_count}`);
    console.log(`Text:          ${row.confession_text}`);
    console.log(SEP);
  }
}

// ── resolve-crisis ────────────────────────────────────────────────────────────

async function resolveCrisis(eventId) {
  const { error } = await supabase.rpc('admin_resolve_crisis', {
    event_id: eventId,
  });

  if (error) {
    console.error('Error resolving crisis event:', error.message);
    process.exit(1);
  }

  console.log(`Crisis event ${eventId} marked as reviewed. ✅`);
}

// ── resolve-report ────────────────────────────────────────────────────────────

async function resolveReport(reportId, restore) {
  const { error } = await supabase.rpc('admin_resolve_report', {
    report_id:          reportId,
    restore_confession: restore,
  });

  if (error) {
    console.error('Error resolving report:', error.message);
    process.exit(1);
  }

  const suffix = restore ? ' Confession restored to live.' : '';
  console.log(`Report ${reportId} resolved.${suffix} ✅`);
}

// ── dispatch ──────────────────────────────────────────────────────────────────

const [,, command, id, flag] = process.argv;

switch (command) {
  case 'crisis':
    await listCrisis();
    break;

  case 'reports':
    await listReports();
    break;

  case 'resolve-crisis':
    if (!id) {
      console.error('Missing <id>.');
      printUsage();
      process.exit(1);
    }
    await resolveCrisis(id);
    break;

  case 'resolve-report':
    if (!id) {
      console.error('Missing <id>.');
      printUsage();
      process.exit(1);
    }
    await resolveReport(id, flag === '--restore');
    break;

  default:
    printUsage();
    process.exit(1);
}
