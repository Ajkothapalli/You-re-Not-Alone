/**
 * "Is the splash overlay gone?" — one sticky boolean.
 *
 * AnimatedSplash is an in-tree overlay in the root layout, so the screen
 * underneath mounts and runs immediately while nobody can see it. For a static
 * screen that does not matter. For an illustration whose whole job is a
 * greeting it does: Lantern's wave runs 0–2.4s of its 5s cycle, the splash
 * dismisses at 2.8s, so the wave always happened behind it and the first thing
 * anyone actually saw was a figure sitting still, for another two seconds.
 *
 * Module-scoped rather than a context, matching lib/audioPlayback.ts: no
 * provider to thread through, and the value outlives any particular tree —
 * which is what makes it correct on the second visit to a screen, when the
 * splash is long gone and the answer should already be yes.
 *
 * Sticky on purpose. It only ever goes false → true, once per app launch.
 */

let done = false;
const listeners = new Set<(v: boolean) => void>();

/** Called by the root layout when the splash overlay finishes melting. */
export function markSplashDone(): void {
  if (done) return;
  done = true;
  listeners.forEach((fn) => fn(true));
}

export function isSplashDone(): boolean {
  return done;
}

export function subscribeSplashDone(fn: (v: boolean) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Test seam — the flag is module state, so it survives between tests. */
export function __resetSplashGate(): void {
  done = false;
  listeners.clear();
}
