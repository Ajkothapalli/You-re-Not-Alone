/**
 * Feed playback — one voice at a time, and never unasked.
 *
 * ── Why a module-scoped registry rather than per-card state ─────────────────
 * Cards do not know about each other. If each owned its own player, scrolling
 * the feed while one played would layer a second, then a third — several
 * strangers' voices overlapping, in an app whose whole texture is one person
 * at a time. The registry is the only thing that can enforce "starting one
 * stops any other", so it lives outside React.
 *
 * ── Nothing autoplays. Ever. ────────────────────────────────────────────────
 * Not on scroll, not on card entry, not on app foreground. Every play is a tap.
 * A confession starting to speak because someone scrolled past it would be
 * both a surprise and, in a public place, a disclosure they did not choose.
 *
 * Playback stops on scroll-away and on backgrounding for the same reason: a
 * voice that keeps going after the card has left the screen is a voice playing
 * to a room the listener is no longer looking at.
 */

import { supabase } from './supabase';

type Stopper = () => void;

/** The card currently playing, and how to stop it. */
let current: { id: string; stop: Stopper } | null = null;

/** Subscribers rendering play/pause state. */
const listeners = new Set<(playingId: string | null) => void>();

function emit() {
  const id = current?.id ?? null;
  listeners.forEach((fn) => fn(id));
}

export function subscribePlayback(fn: (playingId: string | null) => void): () => void {
  listeners.add(fn);
  fn(current?.id ?? null);
  return () => { listeners.delete(fn); };
}

export function currentlyPlaying(): string | null {
  return current?.id ?? null;
}

/**
 * Claim playback for a card. Any other card is stopped first — that ordering is
 * the point, not an implementation detail.
 */
export function claimPlayback(id: string, stop: Stopper): void {
  if (current && current.id !== id) {
    try { current.stop(); } catch { /* the old card may already be unmounted */ }
  }
  current = { id, stop };
  emit();
}

/** Release, but only if this card still holds it — avoids a stale card clearing a newer one. */
export function releasePlayback(id: string): void {
  if (current?.id === id) {
    current = null;
    emit();
  }
}

/** Stop whatever is playing. Used on background, navigation, and scroll-away. */
export function stopAllPlayback(): void {
  if (!current) return;
  try { current.stop(); } catch {}
  current = null;
  emit();
}

// ── Signed URLs ──────────────────────────────────────────────────────────────

/**
 * Short-lived signed URLs, cached in memory only.
 *
 * The object key never reaches the client (CLAUDE.md invariant 3), so playback
 * needs a round trip. Caching avoids one per replay, but the entry is dropped
 * well before the server's TTL and is NEVER persisted — a URL to someone's
 * voice written to disk would outlive the protection the expiry provides.
 */
const URL_TTL_MS = 8 * 60 * 1000;          // server signs for 10; expire ours first
const urlCache = new Map<string, { url: string; at: number }>();

export async function getAudioUrl(confessionId: string): Promise<string | null> {
  const hit = urlCache.get(confessionId);
  if (hit && Date.now() - hit.at < URL_TTL_MS) return hit.url;

  try {
    const { data, error } = await supabase.functions.invoke('get-audio-url', {
      body: { confessionId },
    });
    if (error || !data?.url) return null;
    urlCache.set(confessionId, { url: data.url, at: Date.now() });
    return data.url as string;
  } catch {
    return null;
  }
}

/** Sign-out and account deletion must not leave signed URLs resolvable in memory. */
export function clearAudioUrlCache(): void {
  urlCache.clear();
}
