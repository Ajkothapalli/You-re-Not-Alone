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
  // Reason CODE only — a rejected confession's text is stored nowhere,
  // and must not reach analytics either.
  | { name: 'blocked_not_genuine';   props: { reason_code: string } }
  | { name: 'crisis_flagged';        props: Record<string, never> }
  | { name: 'match_shown';           props: { confession_id: string; felt_count: number } }
  | { name: 'card_shared';           props: { source: string } }
  | { name: 'report_submitted';      props: { confession_id: string } }
  | { name: 'onboarding_read_shown'; props: { confession_id: string } }
  | { name: 'share_click';           props: { bucket: string } }
  | { name: 'install_attributed';    props: { source: string } }
  // W1 writing funnel. A category ID and a placement label — never the
  // starter's text, never a draft, never a confession.
  | { name: 'starter_shown';         props: { category: string } }
  | { name: 'starter_used';          props: { category: string } }
  | { name: 'write_invite_shown';    props: { kind: WriteInviteKind } }
  | { name: 'write_invite_tapped';   props: { kind: WriteInviteKind } }
  // Q1 share funnel. Buckets, look names and booleans — never the confession,
  // never an id, and never the share token (a token beside a bucket would tie
  // an account to a share, which is the one thing the token design prevents).
  | { name: 'share_composer_opened';  props: { source: string } }
  | { name: 'share_look_changed';     props: { look: string } }
  | { name: 'share_sheet_opened';     props: { source: string; look: string; words_included: boolean } }
  | { name: 'share_target_chosen';    props: { source: string; look: string } }
  | { name: 'share_after_shown';      props: Record<string, never> }
  | { name: 'share_after_say_yours_tapped'; props: Record<string, never> }
  | { name: 'write_started';          props: { from: string } }
  // W2 The Question. A question id and counts — never the question text, never
  // the answer, never who answered.
  | { name: 'question_card_shown';      props: Record<string, never> }
  | { name: 'question_answer_tapped';   props: Record<string, never> }
  | { name: 'question_filter_opened';   props: Record<string, never> }
  | { name: 'question_answer_submitted'; props: { question_id: string } }
  | { name: 'question_detached';        props: Record<string, never> }
  | { name: 'question_shared';          props: Record<string, never> }
  // [B] Referral. A variant label, a bucket and a rejection REASON CODE — never
  // a token, an account id, or anything about the invitee.
  | { name: 'invite_entry_opened';      props: { variant: string } }
  | { name: 'invite_shared';            props: { variant: string; source: string } }
  | { name: 'invite_claimed';           props: Record<string, never> }
  | { name: 'invite_claim_rejected';    props: { reason: string } }
  | { name: 'gift_week_granted';        props: { role: 'invitee' | 'inviter' } }
  | { name: 'referral_capped';          props: Record<string, never> };

/** Where a write invite was shown. Labels, not content. */
export type WriteInviteKind = 'targeted' | 'interstitial' | 'footer';

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
  /**
   * [3.6] SUBSTANCE turned a submission away. The CODE only — never the text.
   * A rejected confession is not stored anywhere, and it must not leak into
   * analytics either, which is the one place text could plausibly be sent
   * "just for debugging".
   */
  blockedNotGenuine(reason_code: string) {
    track({ name: 'blocked_not_genuine', props: { reason_code } });
  },
  crisisFlagged() {
    track({ name: 'crisis_flagged', props: {} });
  },
  matchShown(confession_id: string, felt_count: number) {
    track({ name: 'match_shown', props: { confession_id, felt_count } });
  },
  cardShared(source: string) {
    track({ name: 'card_shared', props: { source } });
  },
  starterShown(category: string) {
    track({ name: 'starter_shown', props: { category } });
  },
  starterUsed(category: string) {
    track({ name: 'starter_used', props: { category } });
  },
  writeInviteShown(kind: WriteInviteKind) {
    track({ name: 'write_invite_shown', props: { kind } });
  },
  writeInviteTapped(kind: WriteInviteKind) {
    track({ name: 'write_invite_tapped', props: { kind } });
  },
  shareComposerOpened(source: string) {
    track({ name: 'share_composer_opened', props: { source } });
  },
  shareLookChanged(look: string) {
    track({ name: 'share_look_changed', props: { look } });
  },
  shareSheetOpened(source: string, look: string, words_included: boolean) {
    track({ name: 'share_sheet_opened', props: { source, look, words_included } });
  },
  shareTargetChosen(source: string, look: string) {
    track({ name: 'share_target_chosen', props: { source, look } });
  },
  shareAfterShown() {
    track({ name: 'share_after_shown', props: {} });
  },
  shareAfterSayYoursTapped() {
    track({ name: 'share_after_say_yours_tapped', props: {} });
  },
  writeStarted(from: string) {
    track({ name: 'write_started', props: { from } });
  },
  questionCardShown() {
    track({ name: 'question_card_shown', props: {} });
  },
  questionAnswerTapped() {
    track({ name: 'question_answer_tapped', props: {} });
  },
  questionFilterOpened() {
    track({ name: 'question_filter_opened', props: {} });
  },
  questionAnswerSubmitted(question_id: string) {
    track({ name: 'question_answer_submitted', props: { question_id } });
  },
  questionDetached() {
    track({ name: 'question_detached', props: {} });
  },
  questionShared() {
    track({ name: 'question_shared', props: {} });
  },
  inviteEntryOpened(variant: string) {
    track({ name: 'invite_entry_opened', props: { variant } });
  },
  inviteShared(variant: string, source: string) {
    track({ name: 'invite_shared', props: { variant, source } });
  },
  inviteClaimed() {
    track({ name: 'invite_claimed', props: {} });
  },
  inviteClaimRejected(reason: string) {
    track({ name: 'invite_claim_rejected', props: { reason } });
  },
  giftWeekGranted(role: 'invitee' | 'inviter') {
    track({ name: 'gift_week_granted', props: { role } });
  },
  referralCapped() {
    track({ name: 'referral_capped', props: {} });
  },
  shareClick(bucket: string) {
    track({ name: 'share_click', props: { bucket } });
  },
  installAttributed(source: string) {
    track({ name: 'install_attributed', props: { source } });
    // Also write to growth_events so v_virality counts attributed installs
    const base = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    if (base.startsWith('http')) {
      fetch(`${base}/functions/v1/track`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ event: 'install_attributed', source }),
      }).catch(() => {});
    }
  },
  reportSubmitted(confession_id: string) {
    track({ name: 'report_submitted', props: { confession_id } });
  },
  onboardingReadShown(confession_id: string) {
    track({ name: 'onboarding_read_shown', props: { confession_id } });
  },
};
