/**
 * The starters to offer this reader, and whether to offer them at all.
 *
 * A hook because BOTH write screens need identical behaviour (app/write.tsx and
 * the tab screen), and two copies of "when do chips show" is how they drift.
 *
 * Preferences are fetched once per mount and every failure is silent: a reader
 * whose categories will not load still gets starters (the taxonomy fallback in
 * startersForReader). The blank page is the problem being solved, so falling
 * back to no chips would fail exactly the reader this is for.
 */

import { useEffect, useState } from 'react';
import { getReaderPreferences } from './api';
import { startersForReader } from './starters';

export function useStarters(draft: string) {
  const [categories, setCategories] = useState<string[] | null>(null);

  useEffect(() => {
    let alive = true;
    // try/catch as well as .catch(): a SYNCHRONOUS throw here would take the
    // whole write screen down, and starters are a convenience on the single
    // screen this app cannot afford to lose. Nobody being able to write is a
    // catastrophically worse outcome than nobody getting a chip.
    try {
      getReaderPreferences()
        .then((p) => { if (alive) setCategories(p?.categories ?? []); })
        .catch(() => { if (alive) setCategories([]); });
    } catch {
      setCategories([]);
    }
    return () => { alive = false; };
  }, []);

  return {
    starters: startersForReader(categories ?? []),
    /**
     * Empty means empty — whitespace too. Someone who has typed a space has
     * still not started, and hiding the way in over one stray character would
     * be the most annoying possible moment to hide it.
     *
     * Nothing shows until preferences have RESOLVED (`categories !== null`),
     * which is a correctness rule and not just polish. Rendering during the
     * pending state would paint the every-category fallback for a frame and
     * then swap it for the reader's own — a visible flicker, and worse, a
     * burst of `starter_shown` events for categories this reader never chose,
     * which quietly corrupts the only metric this phase is judged by.
     */
    visible:  categories !== null && draft.trim().length === 0,
  };
}
