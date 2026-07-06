/**
 * Typed API wrappers over Supabase Edge Functions.
 *
 * Pipeline response uses `type` (not `outcome`) so screens can exhaustively
 * switch on it. The Edge Function returns the same field name.
 */
import { supabase } from './supabase';
import { getDummyRecommendations, getDummyMatchCount } from './dummyConfessions';
import type { AuthorshipPayload } from './authorship';
import { saveReceipt, clearReceipts } from './confessionReceipt';
import { resetFtue, resetIntroReads } from './onboarding';
import { clearRtueCache, markRtueSeen } from './rtue';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  status:     'live' | 'approved' | 'under_review' | 'removed';
  created_at: string;
}

export async function getMyConfessions(): Promise<OwnConfession[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke<{ confessions: OwnConfession[] }>(
    'get-my-confessions',
  );
  if (error) throw error;
  return data?.confessions ?? [];
}

export async function removeConfession(confessionId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { error } = await supabase.functions.invoke('manage-confession', {
    body: { confessionId, action: 'remove' },
  });
  if (error) throw error;
}

// ─── Delete account — two-path ────────────────────────────────────────────────

export type DeleteMode = 'erase' | 'anonymize';

export async function getOnboardingConfessions(): Promise<ReadConfession[]> {
  const { data, error } = await supabase.rpc('get_onboarding_confessions', { max_count: 2 });
  if (error) throw error;
  return (data ?? []) as ReadConfession[];
}

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

export async function getRecommendations(): Promise<RecommendationsResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  try {
    const { data, error } = await supabase.functions.invoke<{ confessions: Recommendation[]; premiumRequired?: boolean }>(
      'recommend-confessions',
      { body: { action: 'recommend' } },
    );
    if (error) throw error;
    // Server enforced the paywall — respect it, never fall back to dummy
    // (dummy data would defeat the gate in production).
    if (data?.premiumRequired) return { confessions: [], premiumRequired: true };
    if (data?.confessions?.length) return { confessions: data.confessions, premiumRequired: false };
  } catch {
    // Edge Function not deployed — fall through to preview data so the
    // feature is still usable before billing/backend are wired.
  }

  // PREVIEW FALLBACK — dummy confessions across the reader's chosen
  // categories. Remove once the recommend-confessions function and a
  // real pool are live.
  const prefs = await getReaderPreferences();
  return {
    confessions:    getDummyRecommendations(prefs?.categories ?? []),
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
