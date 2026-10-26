/**
 * [N1] The ask flow, in one place.
 *
 * A screen says "this moment is available" and gets back either a card to
 * render or nothing. Everything else — eligibility, the OS dialog, the
 * token, the toasts, the analytics, the cooldown — happens in here.
 *
 * ── Why the three screens share one hook ────────────────────────────────────
 * "At most one card per session" and "A beats B beats C" are properties of
 * the SESSION, not of any screen. Implemented per-screen they would be
 * three implementations of one rule, and the failure mode is a reader being
 * asked twice in one sitting — which, given a decline starts a 14-day
 * cooldown, means the second ask is answered by somebody already annoyed.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { showToast } from '@/components/Toast';
import { analytics } from '@/lib/analytics';
import {
  shouldAsk, markCardShown, recordDecline, type AskMoment,
} from '@/lib/pushAsk';
import { currentPermission, requestAndRegister } from '@/lib/pushPermission';
import { registerPushToken } from '@/lib/pushRegistration';
import { TOAST_GRANTED, TOAST_DENIED } from '@/components/PushAskCard';

export interface UsePushAsk {
  /** Render PushAskCard when this is non-null. */
  moment:    AskMoment | null;
  onAccept:  () => Promise<void>;
  onDecline: () => void;
  collapsed: boolean;
}

/**
 * @param moment    which moment this screen can offer, or null when the
 *                  screen's own precondition is not met (no unread felt at
 *                  the top of Alerts, say).
 * @param otherAskOnScreen  true when a write invite, premium card or
 *                  referral invite is already visible. One ask at a time.
 */
export function usePushAsk(
  moment: AskMoment | null,
  opts: { otherAskOnScreen?: boolean } = {},
): UsePushAsk {
  const [show, setShow]           = useState<AskMoment | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  /** Guards against the effect racing itself on a fast re-render. */
  const deciding = useRef(false);

  useEffect(() => {
    if (!moment || show || collapsed || deciding.current) return;
    deciding.current = true;

    let alive = true;
    (async () => {
      try {
        const permission = await currentPermission();
        const verdict = await shouldAsk({
          permission,
          available:        [moment],
          otherAskOnScreen: opts.otherAskOnScreen ?? false,
        });
        if (!alive || !verdict.show) return;

        // Claimed for the session BEFORE rendering, so two screens deciding
        // in the same frame cannot both win.
        markCardShown();
        setShow(verdict.moment);
        analytics.pushAskShown(verdict.moment);
      } finally {
        deciding.current = false;
      }
    })();

    return () => { alive = false; };
  }, [moment, opts.otherAskOnScreen]);

  const onAccept = useCallback(async () => {
    if (!show) return;
    analytics.pushAskChoice(show, 'yes');

    // THE one place the system dialog is reached from a screen, and it goes
    // through lib/pushPermission.ts — see the invariant test.
    const res = await requestAndRegister();

    analytics.pushPermission(show, res.granted ? 'granted' : 'denied');

    if (res.granted) {
      if (res.token) void registerPushToken(res.token);
      setCollapsed(true);
      showToast(TOAST_GRANTED);
    } else {
      // No guilt, no second ask. The toast points at Settings and stops.
      setCollapsed(true);
      showToast(TOAST_DENIED);
    }
  }, [show]);

  const onDecline = useCallback(() => {
    if (!show) return;
    analytics.pushAskChoice(show, 'not_now');
    void recordDecline();          // starts the 14-day cooldown
    setCollapsed(true);
  }, [show]);

  return { moment: show, onAccept, onDecline, collapsed };
}
