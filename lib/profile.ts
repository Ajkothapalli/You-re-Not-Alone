/**
 * Profile — the user's character + display name + release count.
 *
 * ACCOUNT-SYNCED (owner decision 2026-06-14): stored on the account in the
 * `profiles` table so it FLOWS ACROSS DEVICES AND PLATFORMS (iOS ↔ Android).
 * An AsyncStorage mirror is kept for instant/offline reads. On login,
 * hydrateProfile() pulls the server row (server wins) so a person sees the
 * same character + name + count everywhere they sign in.
 *
 * Still NEVER shown on confessions — those carry a random per-confession
 * persona, so the author-identity separation invariant is unaffected.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomPersona, getPersonaById } from '../components/Persona';
import { supabase } from './supabase';

const KEY = '@yana/profile';

export interface Profile {
  personaId:    string;
  name:         string;
  releaseCount: number;
}

// In-memory mirror for synchronous reads (celebration count, ProfileButton).
let _mem: Profile | null = null;

async function readLocal(): Promise<Profile> {
  if (_mem) return _mem;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) { _mem = normalize(JSON.parse(raw)); return _mem; }
  } catch { /* fall through */ }
  const persona = randomPersona();
  _mem = { personaId: persona.id, name: persona.name, releaseCount: 0 };
  return _mem;
}

function normalize(p: any): Profile {
  return {
    personaId:    typeof p?.personaId === 'string' ? p.personaId : randomPersona().id,
    name:         typeof p?.name === 'string' ? p.name : '',
    releaseCount: Number.isFinite(p?.releaseCount) ? p.releaseCount : 0,
  };
}

async function persistLocal(p: Profile): Promise<void> {
  _mem = p;
  await AsyncStorage.setItem(KEY, JSON.stringify(p)).catch(() => {});
}

function pushToServer(p: Profile): void {
  // Fire-and-forget — never block the UI on the network.
  (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('profiles').upsert(
      {
        account_id:    user.id,
        persona_id:    p.personaId,
        display_name:  p.name,
        release_count: p.releaseCount,
        updated_at:    new Date().toISOString(),
      },
      { onConflict: 'account_id' },
    );
  })().catch(() => {});
}

/** Synchronous read of the cached profile (hydrate first for cross-device). */
export function getProfileSync(): Profile {
  return _mem ?? { personaId: randomPersona().id, name: '', releaseCount: 0 };
}

export async function getProfile(): Promise<Profile> {
  return readLocal();
}

/**
 * Pull the account's profile from the server and make it the local truth.
 * Call right after auth so the character/name/count are identical on every
 * device. If the account has no row yet, seed it from the local profile.
 */
export async function hydrateProfile(): Promise<Profile> {
  const local = await readLocal();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return local;

  const { data } = await supabase
    .from('profiles')
    .select('persona_id, display_name, release_count')
    .eq('account_id', user.id)
    .maybeSingle();

  if (data) {
    // Server is the source of truth across devices. Release count takes the
    // max so an offline bump on either device is never lost.
    const merged: Profile = {
      personaId:    data.persona_id   ?? local.personaId,
      name:         data.display_name ?? local.name,
      releaseCount: Math.max(data.release_count ?? 0, local.releaseCount),
    };
    await persistLocal(merged);
    if (merged.releaseCount !== (data.release_count ?? 0)) pushToServer(merged);
    return merged;
  }

  // First time on this account — seed the server from whatever's local.
  await persistLocal(local);
  pushToServer(local);
  return local;
}

export async function setProfileName(name: string): Promise<void> {
  const p = await readLocal();
  const next = { ...p, name: name.trim().slice(0, 32) };
  await persistLocal(next);
  pushToServer(next);
}

export async function setProfilePersona(personaId: string): Promise<void> {
  const p = await readLocal();
  const next = { ...p, personaId: getPersonaById(personaId).id };
  await persistLocal(next);
  pushToServer(next);
}

/** Bump the release count locally + on the account; returns the new value. */
export function incrementReleaseCount(): number {
  const base = _mem ?? { personaId: randomPersona().id, name: '', releaseCount: 0 };
  const next = { ...base, releaseCount: base.releaseCount + 1 };
  persistLocal(next).catch(() => {});
  pushToServer(next);
  return next.releaseCount;
}

export function getReleaseCount(): number {
  return _mem?.releaseCount ?? 0;
}

/** Clear the LOCAL mirror (server row is removed by account-deletion cascade). */
export async function clearProfile(): Promise<void> {
  _mem = null;
  await AsyncStorage.removeItem(KEY).catch(() => {});
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
