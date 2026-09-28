/**
 * Sentence starters — the first few words, offered when the page is blank.
 *
 * The hardest part of a confession is the first sentence. Someone opens the
 * write screen already willing, reads "What do you carry that you've never said
 * out loud?", and closes it again because there is no way in. A starter is a
 * way in: it takes nothing away, it is never required, and the moment it is
 * tapped it stops being ours and becomes their text, editable like any other.
 *
 * ── Rules these strings live by ─────────────────────────────────────────────
 * Tender and plain, never clinical. No diagnosis, no advice, no therapy voice,
 * nothing that praises or grades the writer for using it.
 *
 * And — the one that is a safety rule, not a tone rule — a starter NEVER invites
 * a name, a place, a workplace, a date, or anything that identifies a third
 * party. "The thing I never told them is…" is safe; "The thing I never told
 * <name> is…" would hand a writer a prompt to identify someone who never
 * consented to appear here, on a surface that has no reply channel for them to
 * object through. Every starter is written in the first person about the
 * writer's own interior, and pronouns stay generic.
 *
 * They deliberately trail off with an ellipsis. A complete sentence would be
 * our confession; an unfinished one is an invitation.
 *
 * Starters are NEVER shown on the crisis path — that screen offers resources
 * and nothing else (CLAUDE.md #6).
 */

import { CATEGORY_IDS, type CategoryId } from './categories';

export const STARTERS_PER_CATEGORY = 4;

/** How many chips are visible at once; the rest scroll horizontally. */
export const MAX_VISIBLE_STARTERS = 4;

export const STARTERS: Record<CategoryId, readonly string[]> = {
  mental_health: [
    'Nobody knows that I…',
    'The part of my day nobody sees is…',
    'I keep pretending that…',
    'What I actually feel is…',
  ],
  relationships: [
    'The thing I never told them is…',
    'I still think about…',
    'I miss the version of us that…',
    'I wish they knew…',
  ],
  grief: [
    "What I'd tell you if you could hear me…",
    'I still…',
    'Nobody asks me about…',
    'The hardest day is…',
  ],
  secrets: [
    "I've never told anyone that…",
    'I still feel guilty about…',
    'If people knew…',
    'The truth is…',
  ],
  work_identity: [
    "I'm not who they think I am because…",
    "I'm afraid that…",
    'I pretend to be sure about…',
    'What I really want is…',
  ],
  body_health: [
    "I don't talk about my body because…",
    'Nobody sees that…',
    "I'm tired of…",
    'What scares me is…',
  ],
  faith_meaning: [
    "I've stopped believing…",
    "I'm searching for…",
    'What keeps me going is…',
    "I'm not sure anymore that…",
  ],
};

export function isCategoryId(id: unknown): id is CategoryId {
  return typeof id === 'string' && (CATEGORY_IDS as readonly string[]).includes(id);
}

/** The starters for one category, or none if the id is not one we know. */
export function startersFor(category: string): readonly string[] {
  return isCategoryId(category) ? STARTERS[category] : [];
}

/**
 * The chips to show for a reader, given the categories they chose.
 *
 * One per category before a second from any of them, so a reader who picked
 * four categories sees all four represented rather than four variations on
 * whichever happened to sort first. A reader who chose one category sees that
 * category's four.
 *
 * No categories chosen — a reader who skipped the picker, or whose preferences
 * failed to load — still gets starters: one from each category in taxonomy
 * order. An empty write screen with no way in is the thing this exists to
 * prevent, and falling back to nothing would reproduce it exactly for the
 * readers least set up to write.
 */
export function startersForReader(
  categories: readonly string[],
  limit = MAX_VISIBLE_STARTERS,
): string[] {
  const chosen = categories.filter(isCategoryId);
  const pool: CategoryId[] = chosen.length > 0 ? chosen : [...CATEGORY_IDS];

  const out: string[] = [];
  for (let round = 0; round < STARTERS_PER_CATEGORY && out.length < limit; round++) {
    for (const c of pool) {
      if (out.length >= limit) break;
      const s = STARTERS[c][round];
      if (s) out.push(s);
    }
  }
  return out;
}

/**
 * Which category a starter belongs to — for the `starter_used { category }`
 * event. Returns null for text the writer has edited, which is the common case
 * and not an error: once they change a word it is their sentence, not ours.
 */
export function categoryOfStarter(starter: string): CategoryId | null {
  for (const id of CATEGORY_IDS) {
    if (STARTERS[id].includes(starter)) return id;
  }
  return null;
}
