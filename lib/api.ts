/**
 * Typed API wrappers over Supabase Edge Functions.
 *
 * Pipeline response uses `type` (not `outcome`) so screens can exhaustively
 * switch on it. The Edge Function returns the same field name.
 */
import { supabase } from './supabase';
import { getDummyRecommendations, getDummyMatchCount, isRichConfession } from './dummyConfessions';
import type { AuthorshipPayload } from './authorship';
import { saveReceipt, clearReceipts } from './confessionReceipt';
import { resetFtue, resetIntroReads } from './onboarding';
import { clearRtueCache, markRtueSeen } from './rtue';
import { withTimeout } from './withTimeout';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Thrown when a call needs a signed-in user and there isn't one.
 *
 * Typed so screens can tell "your session ended" apart from "the network
 * failed" — the two need different recoveries, and collapsing them into one
 * generic empty state sends people off fixing things that were never broken.
 */
export class AuthRequiredError extends Error {
  constructor() {
    super('Not authenticated');
    this.name = 'AuthRequiredError';
  }
}

/**
 * Is this failure a missing/expired session? Falls back to the message for the
 * call sites that still throw a plain Error('Not authenticated').
 */
export function isAuthError(e: unknown): boolean {
  if (e instanceof AuthRequiredError) return true;
  return /not authenticated/i.test(String((e as Error)?.message ?? ''));
}

// "submitted" = confession stored, no match found yet (first person to feel this)
// "matched"   = a semantically close past confession was found
// "blocked"   = moderation gate rejected the text
// "crisis"    = crisis keywords detected — resources shown, nothing stored
export type PipelineType = 'submitted' | 'matched' | 'blocked' | 'crisis';

export interface CrisisResource {
  name:    string;
  number?: string;
  url?:    string;
  note?:   string;
}

export interface MatchResult {
  id:        string;
  text:      string;
  feltCount: number;
}

export interface SubmitResult {
  type:               PipelineType;
  match?:             MatchResult;
  submittedId?:       string;  // author's own new confession id (on-device receipt only)
  status?:            'live' | 'under_review';  // confession's post-insert status
  crisisResources?:   CrisisResource[];
  blockReason?:       string;
}

/**
 * Submits a confession through the full server-side safety pipeline.
 * @param deviceHash — stable per-install hash from lib/deviceHash.ts
 * @param region     — coarse hint for crisis resources (e.g. "IN", "US")
 */
export async function submitConfession(
  text:        string,
  deviceHash:  string,
  region?:     string,
  authorship?: AuthorshipPayload,
): Promise<SubmitResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke<SubmitResult>(
    'submit-confession',
    { body: { text, deviceHash, region, authorship } },
  );

  if (error) {
    // FunctionsHttpError wraps the raw Response in .context — extract the real message
    try {
      const body = await (error as any).context?.json?.();
      if (body?.error) throw new Error(body.error);
    } catch (inner: any) {
      if (inner?.message && !inner.message.startsWith('Edge Function')) throw inner;
    }
    throw error;
  }

  // The Edge Function currently returns `outcome`; normalise to `type` here
  // until the Edge Function is updated to use the `type` field directly.
  const raw = data as unknown as Record<string, unknown>;
  if (!raw.type && raw.outcome) {
    raw.type = raw.outcome === 'matched' && !(raw as any).match?.id
      ? 'submitted'
      : raw.outcome;
  }

  const result = data!;

  // On-device receipt: store the author's own new confession id so the return
  // loop can track felt_count growth across sessions.
  // - submitted: match.id IS the author's new confession
  // - matched:   submittedId is the author's new confession; match.id is the reader's match
  // Privacy: links this device to its confessions; ids only; clearable; never sent to server.
  const ownId =
    result.submittedId ??
    (result.type === 'submitted' ? result.match?.id : undefined);
  if (ownId && (result.type === 'matched' || result.type === 'submitted')) {
    saveReceipt(ownId, 0, text).catch(() => {});
  }

  return result;
}

export async function reportConfession(
  confessionId: string,
  reason:       string,
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { error } = await supabase.functions.invoke('report', {
    body: { confessionId, reason },
  });
  if (error) throw error;
}

/**
 * Permanently deletes the current account and all attributable data.
 * Irreversible.
 *
 * After calling:
 * - Authored confessions without active reports are hard-deleted immediately.
 * - Authored confessions with active reports are set 'removed' (legal hold)
 *   and hard-deleted automatically by the daily purge once those reports age out.
 * - crisis_events are stored without account linkage; they cannot be attributed
 *   or deleted per DSAR.
 * - CSAM reports are never deleted (legal obligation).
 *
 * Calls supabase.auth.signOut() on success.
 * No UI is wired to this function yet — wrapper only.
 */
export async function deleteAccount(mode: DeleteMode = 'erase'): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { error } = await supabase.functions.invoke('delete-account', {
    body: { confirm: 'DELETE', mode },
  });
  if (error) throw error;

  await Promise.allSettled([
    clearReceipts(),
    resetFtue(),
    resetIntroReads(),
    AsyncStorage.removeItem('@yana/rtue_v1'),
    AsyncStorage.removeItem('@yana/reader_prefs'),
  ]);
  clearRtueCache();
  await supabase.auth.signOut();
}

export interface ReadConfession {
  id:         string;
  text:       string;
  felt_count: number;
}

// ─── My Confessions ───────────────────────────────────────────────────────────

export interface OwnConfession {
  id:         string;
  text:       string;
  felt_count: number;
  can_edit:   boolean;       // server-computed: real_felt_count = 0; never expose real_felt_count
  updated_at: string | null; // null until first edit; shown as "· edited" in owner view
  status:     'live' | 'approved' | 'under_review' | 'removed' | 'retired' | 'deleted';
  created_at: string;
}

export interface EditResult {
  sealed?:    true;          // confession sealed (race: a real felt arrived while editing)
  blocked?:   true;          // moderation or crisis gate rejected the new text
  reason?:    string;        // block reason code (e.g. 'crisis', 'harassment,violence')
  success?:   true;          // edit saved
  confession?: OwnConfession; // reflects new state on success (can_edit still true)
}

export async function editConfession(
  confessionId: string,
  text:         string,
): Promise<EditResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke<EditResult>(
    'edit-confession',
    { body: { id: confessionId, text } },
  );
  if (error) {
    try {
      const body = await (error as any).context?.json?.();
      if (body?.error) throw new Error(body.error);
    } catch (inner: any) {
      if (inner?.message && !inner.message.startsWith('Edge Function')) throw inner;
    }
    throw error;
  }
  return data!;
}

export async function getMyConfessions(): Promise<OwnConfession[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  // supabase-js's functions.invoke() defaults to POST when no method is given,
  // but the get-my-confessions Edge Function only accepts GET (405s anything
  // else) — every call was failing before this was made explicit, which is
  // why confession history never loaded regardless of what was in the DB.
  const { data, error } = await supabase.functions.invoke<{ confessions: OwnConfession[] }>(
    'get-my-confessions',
    { method: 'GET' },
  );
  if (error) throw error;
  return data?.confessions ?? [];
}

export async function retireConfession(confessionId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { error } = await supabase.functions.invoke('manage-confession', {
    body: { confessionId, action: 'retire' },
  });
  if (error) throw error;
}

// ─── Delete account — two-path ────────────────────────────────────────────────

export type DeleteMode = 'erase' | 'anonymize';

// getOnboardingConfessions() was removed 2026-09-13 along with app/read.tsx —
// it existed only to fetch that screen's 2 capped confessions. The
// get_onboarding_confessions RPC is left in the database (harmless, unused);
// dropping it is a separate migration if anyone wants the cleanup.

// ─── Reader preferences ───────────────────────────────────────────────────────

export interface ReaderPreferences {
  categories: string[];
}

export async function getReaderPreferences(): Promise<ReaderPreferences | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('reader_preferences')
    .select('categories')
    .eq('account_id', user.id)
    .maybeSingle();
  return data ?? null;
}

export async function saveReaderPreferences(categories: string[]): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('reader_preferences').upsert(
    {
      account_id: user.id,
      categories,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'account_id' },
  );
  if (error) throw error;
}

// ─── Recommendations ──────────────────────────────────────────────────────────

export interface Recommendation {
  id:         string;
  text:       string;
  feltCount:  number;
  categories: string[];
}

export interface RecommendationsResult {
  confessions:    Recommendation[];
  premiumRequired: boolean;
}

/**
 * The feed is NEVER empty (owner decision 2026-09-13). Real confessions come
 * first; curated/AI stories top the feed up when real volume is thin, and
 * recede on their own as real ones arrive (the server ranks source='user'
 * above generated — see recommend-confessions). A reader should never open
 * Read and find nothing, whatever their account age or subscription state.
 *
 * @param richOnly   — prefer substantial, story-shaped confessions (used for
 *                     readers inside the intro window, where a one-liner is a
 *                     poor first impression of what this place is for).
 * @param excludeIds — ids already shown earlier this reading session. Only
 *                     consumed by the dummy-fallback path below — the real
 *                     recommend-confessions Edge Function already excludes a
 *                     reader's seen confessions server-side via read_events
 *                     (see recommend_confessions SQL RPC), so nothing needs
 *                     threading into its request body.
 */
// Below this, top the feed up from the curated pool rather than showing a
// short or empty feed. Not a cap — a floor.
const FEED_FLOOR = 8;

export async function getRecommendations(
  richOnly = false,
  excludeIds: string[] = [],
): Promise<RecommendationsResult> {
  // Every await here is bounded. This screen is the post-login landing
  // destination inside D7, and unlike app/index.tsx it has no watchdog behind
  // it — an unbounded hang here is an infinite spinner on the Read tab with no
  // way out, which is exactly the "stuck on loading" class of bug the boot path
  // already has three fixes for. Timing out into the error state (which offers
  // Try again) or into the preview pool is always better than spinning.
  const { data: { session } } = await withTimeout(supabase.auth.getSession(), 4_000, 'session');
  if (!session) throw new AuthRequiredError();

  let real: Recommendation[] = [];

  try {
    // Edge Functions cold-start, so this gets more room than the others —
    // but still a bound, not none.
    const { data, error } = await withTimeout(
      supabase.functions.invoke<{ confessions: Recommendation[]; premiumRequired?: boolean }>(
        'recommend-confessions',
        { body: { action: 'recommend' } },
      ),
      8_000,
      'recommend',
    );
    if (error) throw error;
    // The server pool carries no richness flag, so filter on the text itself
    // for readers still inside the intro window.
    real = richOnly
      ? (data?.confessions ?? []).filter(c => isRichConfession(c.text))
      : (data?.confessions ?? []);
  } catch {
    // Edge Function not deployed, erroring, or too slow — fall through to the
    // curated pool rather than leaving the reader on a spinner or an empty feed.
  }

  // Real confessions first, then top up from the curated pool if the feed
  // would otherwise be thin. Every reader gets a full feed on day one, and the
  // curated share shrinks by itself as real volume grows — no cutover to run,
  // and no category that suddenly goes empty.
  if (real.length >= FEED_FLOOR) {
    return { confessions: real, premiumRequired: false };
  }

  const prefs   = await withTimeout(getReaderPreferences(), 5_000, 'prefs').catch(() => null);
  const seen    = new Set([...excludeIds, ...real.map(c => c.id)]);
  const topUp   = getDummyRecommendations(
    prefs?.categories ?? [],
    Number.MAX_SAFE_INTEGER,
    Array.from(seen),
    richOnly,
  );

  return {
    confessions:     [...real, ...topUp],
    premiumRequired: false,
  };
}

/**
 * How many more confessions match the reader's chosen categories — the count
 * shown under the onboarding cards as the "read more" unlock hook. Uses the
 * preview pool until the real pool/count endpoint is live.
 */
export async function getMatchingCount(): Promise<number> {
  const prefs = await getReaderPreferences();
  return getDummyMatchCount(prefs?.categories ?? []);
}

export type ReadSignal = 'impression' | 'read_to_end' | 'felt' | 'share' | 'skip' | 'report';

export async function logReadEvent(confessionId: string, signal: ReadSignal): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return; // fire-and-forget; don't throw

  supabase.functions.invoke('recommend-confessions', {
    body: { action: 'signal', confessionId, signal },
  }).catch(() => {}); // analytics: never block the UI on failures
}

export async function createOrUpdateAccount(dob: Date, authProvider = 'email'): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('accounts').upsert(
    {
      id:            user.id,
      dob:           dob.toISOString().split('T')[0],
      auth_provider: authProvider,
    },
    { onConflict: 'id' },
  );
  if (error) throw error;
}
