/**
 * ShareFlow — composer → release → sheet → after, as one mountable piece.
 *
 * The three screens that can share (the feed, RTUE, the match screen) all want
 * the identical sequence, and three copies of "when does the after screen play"
 * is how they drift. They render this instead and pass what they have.
 *
 * The after screen appears ONLY when the composer reports that a target app was
 * actually chosen — never on a dismissed chooser.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import ShareComposer from './ShareComposer';
import ShareAfter from './ShareAfter';
import { showToast } from '@/components/Toast';
import { analytics } from '@/lib/analytics';
import { openShareSheet, type PreparedShare } from '@/lib/shareCard';
import type { LookId } from '@/lib/shareLooks';
import type { ShareSource } from '@/lib/shareLink';

export interface ShareFlowProps {
  visible:   boolean;
  onClose:   () => void;
  source:    ShareSource;
  text:      string;
  category:  string | null;
  feltCount: number;
  own?:      boolean;
  tagline?:  string;
  /** Fired once the share demonstrably went out — for read-event logging. */
  onShared?: () => void;
}

/** Long enough for a slow chooser, short enough not to feel abandoned. */
const STUCK_AFTER_MS = 30_000;

export default function ShareFlow({
  visible, onClose, source, text, category, feltCount, own = false, tagline, onShared,
}: ShareFlowProps) {
  const [after, setAfter]     = useState(false);
  // Rotates the after-screen heading so two shares do not read the same.
  const [variant, setVariant] = useState(() => Math.floor(Math.random() * 4));

  /**
   * Set while the native share sheet is being presented.
   *
   * The composer Modal must be CLOSED before the sheet opens. On Android the
   * chooser is an Activity, and launching it while a React Native Modal is
   * mounted — a separate window — puts the chooser behind it, leaving the
   * user on a blank grey screen with no way forward. That is the bug this
   * state exists to prevent, so it also gates the Modal's own `visible`.
   */
  const [presenting, setPresenting] = useState<{
    prepared: PreparedShare; look: LookId; includeWords: boolean;
  } | null>(null);

  const handledRef = useRef(false);

  const handleRelease = useCallback(
    (prepared: PreparedShare, look: LookId, includeWords: boolean) => {
      handledRef.current = false;
      setPresenting({ prepared, look, includeWords });
    }, []);

  useEffect(() => {
    if (!presenting || handledRef.current) return;
    handledRef.current = true;

    let alive = true;
    (async () => {
      // This effect runs after the render that set `visible` false, but the
      // Android window is torn down asynchronously — a frame of grace before
      // launching the chooser is the difference between it appearing in front
      // and appearing behind.
      //
      // Nothing is AWAITED here but the sheet itself. The capture already
      // finished while the card was mounted (ShareComposer.finishShare);
      // awaiting it here instead is what produced the grey screen.
      await new Promise((r) => setTimeout(r, 250));

      try {
        const result = await openShareSheet(presenting.prepared);
        if (!alive) return;
        if (result.choseTarget) {
          analytics.shareTargetChosen(source, presenting.look);
          onShared?.();
          setVariant((v) => v + 1);
          setAfter(true);
          setPresenting(null);
          return;
        }
        // Dismissed without choosing: nothing is celebrated, and the composer
        // comes back so the share is not silently lost.
      } catch {
        if (alive) showToast('Could not share', 'error');
      }
      // ALWAYS clears, on every path. This is what brings the composer back
      // after a dismissed chooser — and the reason the screen could get
      // stuck was a path that never reached it.
      if (alive) setPresenting(null);
    })();

    return () => { alive = false; };
  }, [presenting, source, onShared]);

  /**
   * A watchdog, because this screen has now got stuck twice.
   *
   * Whatever happens — a chooser that never returns, an unhandled path, a
   * platform quirk nobody predicted — `presenting` is cleared after
   * STUCK_AFTER_MS and the composer comes back. The share may be lost; the
   * reader is never left on a blank screen with no way forward, which is
   * the failure that actually matters.
   */
  useEffect(() => {
    if (!presenting) return;
    const t = setTimeout(() => setPresenting(null), STUCK_AFTER_MS);
    return () => clearTimeout(t);
  }, [presenting]);

  const done = useCallback(() => {
    setAfter(false);
    setPresenting(null);
    onClose();
  }, [onClose]);

  return (
    <>
      <ShareComposer
        visible={visible && !after && !presenting}
        onClose={onClose}
        source={source}
        text={text}
        category={category}
        feltCount={feltCount}
        own={own}
        tagline={tagline}
        onRelease={handleRelease}
      />
      <ShareAfter
        visible={after}
        own={own}
        category={category}
        variant={variant}
        onDone={done}
        // "Share it another way" returns to the composer, which advances to the
        // next look on open — so a second share of the same words looks new.
        onAnother={() => setAfter(false)}
      />
    </>
  );
}

export type { LookId };
