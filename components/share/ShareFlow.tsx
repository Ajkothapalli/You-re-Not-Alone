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

import React, { useCallback, useState } from 'react';
import ShareComposer from './ShareComposer';
import ShareAfter from './ShareAfter';
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

export default function ShareFlow({
  visible, onClose, source, text, category, feltCount, own = false, tagline, onShared,
}: ShareFlowProps) {
  const [after, setAfter]     = useState(false);
  // Rotates the after-screen heading so two shares do not read the same.
  const [variant, setVariant] = useState(() => Math.floor(Math.random() * 4));

  const handleShared = useCallback(() => {
    onShared?.();
    setVariant((v) => v + 1);
    setAfter(true);
  }, [onShared]);

  const done = useCallback(() => {
    setAfter(false);
    onClose();
  }, [onClose]);

  return (
    <>
      <ShareComposer
        visible={visible && !after}
        onClose={onClose}
        source={source}
        text={text}
        category={category}
        feltCount={feltCount}
        own={own}
        tagline={tagline}
        onShared={handleShared}
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
