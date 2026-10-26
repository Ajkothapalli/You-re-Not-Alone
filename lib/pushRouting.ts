/**
 * [N1] What happens when somebody taps a push.
 *
 * The payload carries a route and nothing else (_shared/pushRules.ts
 * buildData), so this is deliberately small: validate the route against a
 * whitelist, and jump to the tab.
 *
 * ── Why the whitelist, when we control the sender ───────────────────────────
 * A notification payload arrives from outside the app. It is the one piece
 * of routing input that does not come from this codebase, and treating it
 * as trusted is how an app ends up navigable from a push somebody else
 * crafted. Two routes are possible; anything else lands on the feed.
 *
 * ── Tab JUMP, not push (Phase NAV) ──────────────────────────────────────────
 * router.navigate against a tab route reuses the existing tab. push() or
 * replace() would create a second (tabs) shell — the exact bug NAV removed,
 * arriving from a new direction, and one that only shows up for people who
 * opened the app from a notification.
 */

import { router } from 'expo-router';
import { analytics } from './analytics';

const ROUTES = { '/notifications': true, '/explore': true } as const;
export type PushRoute = keyof typeof ROUTES;

/** Untrusted input in, a safe route out. */
export function safeRoute(raw: unknown): PushRoute {
  return (typeof raw === 'string' && raw in ROUTES) ? raw as PushRoute : '/explore';
}

/**
 * Handle a tap.
 *
 * `kind` is inferred from the route rather than sent: one less field in a
 * payload that should carry as little as possible, and the mapping is
 * one-to-one anyway.
 */
export function openFromPush(data: unknown): void {
  const route = safeRoute((data as { route?: unknown } | null)?.route);
  analytics.pushOpened(route === '/notifications' ? 'felt' : 'question');
  // A jump. Opening Alerts marks them read exactly as a tab tap does —
  // that behaviour lives in the screen's focus effect and is untouched.
  router.navigate(route);
}
