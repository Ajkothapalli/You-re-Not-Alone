/**
 * What we say when [3.6] SUBSTANCE turns a submission away.
 *
 * One module, because app/write.tsx and app/(tabs)/write.tsx are near-
 * duplicates that have already drifted apart once (the dictation feature was
 * built into both separately). Copy this important should exist once.
 *
 * ── The tone is the point ───────────────────────────────────────────────────
 * The person on the other side of this dialog just tried to say something they
 * may never have said out loud, and a machine told them no. Every line here is
 * written on the assumption that they were sincere and we were wrong:
 *
 *   - Never "invalid", "rejected", "spam", "gibberish", or anything that
 *     names what we think they did.
 *   - Never imply they were testing or messing about, even when they were.
 *   - Always say the words are still there, because the fear is losing them.
 *   - Ask, don't instruct: "Say a little more?" not "Write more."
 *
 * The draft is ALWAYS kept. That is enforced by the caller, and there is a
 * test for it — the dialog saying the words are still here has to be true.
 */

import type { NotGenuineReason } from './api';

export interface NotGenuineCopy {
  title: string;
  body:  string;
}

const DEFAULT_COPY: NotGenuineCopy = {
  title: 'Say a little more?',
  body:
    "This doesn't look like something you meant to share yet. " +
    "Your words are still here — write it the way you'd say it.",
};

const CONTACT_COPY: NotGenuineCopy = {
  title: 'Keep it anonymous',
  body:
    "Links, handles and phone numbers can't be shared here — " +
    'soulyap stays anonymous for everyone.',
};

/**
 * Only contact details get their own message. The other codes
 * (too_short / no_letters / repetition / not_genuine) all mean roughly "we
 * could not read this as a confession", and spelling out WHICH rule fired
 * would read as a machine grading someone's attempt to open up.
 */
export function notGenuineCopy(reason: NotGenuineReason): NotGenuineCopy {
  return reason === 'contact_or_link' ? CONTACT_COPY : DEFAULT_COPY;
}
