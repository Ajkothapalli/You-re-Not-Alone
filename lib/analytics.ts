/**
 * Analytics — privacy-preserving event wrapper.
 *
 * Rules (from CLAUDE.md):
 *   - IDs and counts only — NEVER confession text
 *   - crisis_flagged carries no id, no text
 *   - Confession text never appears in any event payload
 *
 * Provider: PostHog-compatible endpoint (swap for Amplitude/Segment/custom as needed).
 * Set EXPO_PUBLIC_ANALYTICS_KEY to enable. Omit it to run silently.
 * track() never throws — analytics must never block the user flow.
 */

const ANALYTICS_KEY = process.env.EXPO_PUBLIC_ANALYTICS_KEY ?? '';

// PostHog batch capture endpoint. Replace with your provider's ingest URL.
const ANALYTICS_ENDPOINT = 'https://app.posthog.com/capture/';

type AnalyticsEvent =
  | { name: 'confession_submitted';  props: { confession_id: string } }
  | { name: 'blocked_by_moderation'; props: { reason_code?: string } }
  | { name: 'crisis_flagged';        props: Record<string, never> }
  | { name: 'match_shown';           props: { confession_id: string; felt_count: number } }
  | { name: 'card_shared';           props: Record<string, never> }
  | { name: 'report_submitted';      props: { confession_id: string } }
  | { name: 'onboarding_read_shown'; props: { confession_id: string } };

function track(event: AnalyticsEvent): void {
  if (__DEV__) {
    console.log('[analytics]', event.name, event.props);
  }

  if (!ANALYTICS_KEY) return;

  // Fire-and-forget — never awaited, never throws
  fetch(ANALYTICS_ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key:    ANALYTICS_KEY,
      event:      event.name,
      properties: event.props,
      timestamp:  new Date().toISOString(),
    }),
  }).catch(() => {
    // Swallow silently — analytics must never impact the user flow
  });
}

export const analytics = {
  confessionSubmitted(confession_id: string) {
    track({ name: 'confession_submitted', props: { confession_id } });
  },
  blockedByModeration(reason_code?: string) {
    track({ name: 'blocked_by_moderation', props: { reason_code } });
  },
  crisisFlagged() {
    track({ name: 'crisis_flagged', props: {} });
  },
  matchShown(confession_id: string, felt_count: number) {
    track({ name: 'match_shown', props: { confession_id, felt_count } });
  },
  cardShared() {
    track({ name: 'card_shared', props: {} });
  },
  reportSubmitted(confession_id: string) {
    track({ name: 'report_submitted', props: { confession_id } });
  },
  onboardingReadShown(confession_id: string) {
    track({ name: 'onboarding_read_shown', props: { confession_id } });
  },
};
