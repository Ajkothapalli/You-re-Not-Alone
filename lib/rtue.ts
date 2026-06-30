/**
 * RTUE orchestrator — Return-to-Use Experience.
 *
 * Evaluates the user's most recent confession receipt against its current
 * felt_count and returns exactly ONE moment descriptor, or null if nothing
 * meaningful has changed (no-show).
 *
 * States:
 *   not_yet  — count = 0, first check (reframes the wait, never shows "0")
 *   one      — count just hit 1 (single stranger, less alone)
 *   few      — count 2–9 (plural warmth, never "only N")
 *   growing  — count ≥ 10, gained > 0 since last visit
 *   milestone— crossed 100 / 500 / 1k / 5k / 10k
 *
 * Privacy: only queries confessions_public by an ID the device already holds
 * on-device receipts. No account_id, no author_token. The view never returns
 * removed or under_review rows, so those quietly skip the RTUE.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getReceipts } from './confessionReceipt';
import { supabase } from './supabase';

export type RtueState = 'not_yet' | 'one' | 'few' | 'growing' | 'milestone';

export interface RtueMoment {
  state:    RtueState;
  id:       string;
  text:     string;       // confession text (from receipt or DB fallback)
  current:  number;       // current felt_count
  lastSeen: number | null; // null = first time checking this confession
  gained:   number;       // current − (lastSeen ?? 0)
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const RTUE_KEY  = '@yana/rtue_v1';
const MILESTONES = [100, 500, 1_000, 5_000, 10_000] as const;

type SeenMap = Record<string, { count: number } | undefined>;

async function readSeen(): Promise<SeenMap> {
  try {
    const raw = await AsyncStorage.getItem(RTUE_KEY);
    return raw ? (JSON.parse(raw) as SeenMap) : {};
  } catch { return {}; }
}

export async function markRtueSeen(id: string, count: number): Promise<void> {
  const seen = await readSeen();
  seen[id] = { count };
  await AsyncStorage.setItem(RTUE_KEY, JSON.stringify(seen)).catch(() => {});
  _cache = undefined;
}

// ─── Cache (avoids double DB round-trip when index.tsx checks then rtue.tsx mounts) ──

let _cache: RtueMoment | null | undefined = undefined;

export function clearRtueCache(): void { _cache = undefined; }

// ─── State classification ─────────────────────────────────────────────────────

function classify(
  current:  number,
  lastSeen: number | null,
): RtueState | null {
  if (current === 0) {
    // Show "not yet" only on the very first return (lastSeen === null).
    // After that, the not-yet moment has been dismissed and the count is still
    // 0 — don't keep showing the same state on every launch.
    return lastSeen === null ? 'not_yet' : null;
  }

  if (lastSeen !== null && current === lastSeen) return null;  // no change

  const base = lastSeen ?? 0;

  for (const m of MILESTONES) {
    if (base < m && current >= m) return 'milestone';
  }

  if (current === 1) return 'one';
  if (current < 10)  return 'few';
  return 'growing';
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function _compute(): Promise<RtueMoment | null> {
  const receipts = await getReceipts();
  if (receipts.length === 0) return null;

  const receipt = receipts[0];  // most recent confession

  const seen    = await readSeen();
  const entry   = seen[receipt.id];
  const lastSeen = entry !== undefined ? entry.count : null;

  // Fetch current count (and text fallback) from the public view.
  // Returns null if removed, under_review, or network error → skip RTUE.
  let current: number;
  let dbText: string | null = null;
  try {
    const { data } = await supabase
      .from('confessions_public')
      .select('felt_count, text')
      .eq('id', receipt.id)
      .maybeSingle();
    if (!data) return null;
    current = data.felt_count as number;
    dbText  = data.text as string;
  } catch { return null; }

  const state = classify(current, lastSeen);
  if (!state) return null;

  const text   = receipt.text ?? dbText ?? '…';
  const gained = current - (lastSeen ?? 0);

  return { state, id: receipt.id, text, current, lastSeen, gained };
}

export async function evaluateRtue(): Promise<RtueMoment | null> {
  if (_cache !== undefined) return _cache;
  _cache = await _compute();
  return _cache;
}
