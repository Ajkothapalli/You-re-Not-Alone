/**
 * Typed API wrappers over Supabase Edge Functions.
 *
 * Pipeline response uses `type` (not `outcome`) so screens can exhaustively
 * switch on it. The Edge Function returns the same field name.
 */
import { supabase } from './supabase';

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
  type:             PipelineType;
  match?:           MatchResult;
  crisisResources?: CrisisResource[];
  blockReason?:     string;
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
): Promise<SubmitResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke<SubmitResult>(
    'submit-confession',
    { body: { text, deviceHash, region } },
  );

  if (error) throw error;

  // The Edge Function currently returns `outcome`; normalise to `type` here
  // until the Edge Function is updated to use the `type` field directly.
  const raw = data as unknown as Record<string, unknown>;
  if (!raw.type && raw.outcome) {
    raw.type = raw.outcome === 'matched' && !(raw as any).match?.id
      ? 'submitted'
      : raw.outcome;
  }

  return data!;
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
export async function deleteAccount(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { error } = await supabase.functions.invoke('delete-account', {
    body: { confirm: 'DELETE' },
  });
  if (error) throw error;

  await supabase.auth.signOut();
}

export async function createOrUpdateAccount(dob: Date): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('accounts').upsert(
    {
      id:            user.id,
      dob:           dob.toISOString().split('T')[0],
      auth_provider: 'email',
    },
    { onConflict: 'id' },
  );
  if (error) throw error;
}
