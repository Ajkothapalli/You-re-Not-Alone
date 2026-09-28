/**
 * [3.6] SUBSTANCE — is this a genuine attempt to share something?
 *
 * Runs AFTER [3] crisis and [3.5] language, before [4] embed. Shared by
 * submit-confession and edit-confession so an edit cannot launder text past a
 * gate the original had to clear.
 *
 * ── What this is NOT ────────────────────────────────────────────────────────
 * Not a safety gate. Moderation ([2]) is the safety gate and fails CLOSED in
 * every environment; this one fails OPEN. Rejecting junk is a quality
 * judgement, and the cost of a false positive here is a real person being told
 * their confession does not count — which is the single worst thing this app
 * can say to someone. So: when unsure, allow.
 *
 * ── Why Layer 1 is deliberately thin ────────────────────────────────────────
 * Every "is this real words" heuristic that works in English breaks somewhere
 * else. Dictionary checks reject Hinglish. Keyboard-mash detection (adjacent-
 * key runs) flags perfectly ordinary Devanagari. Vowel-ratio rules reject
 * Thai. So Layer 1 only catches things that are junk in ANY language — too
 * short, no letters at all, one character repeated, a phone number — and
 * everything requiring judgement goes to Layer 2, which reads meaning.
 *
 * Layer 1 has no dependencies and no I/O on purpose: it is the half that
 * always runs, including when there is no API key, and it is directly
 * testable.
 */

export type SubstanceReason =
  | 'too_short'
  | 'no_letters'
  | 'repetition'
  | 'contact_or_link'
  | 'not_genuine';

export type SubstanceResult =
  | { ok: true;  check: 'passed' | 'unchecked' }
  | { ok: false; reason: SubstanceReason };

/**
 * The floor, and why it is this low.
 *
 * "I cheated." and "I'm gay." are complete confessions. They are also eight to
 * ten characters and two or three words, and an earlier 10-character / 3-word
 * floor rejected both — the app telling someone that the hardest sentence they
 * have ever typed does not count. Two words is the smallest floor that still
 * catches "hello" and "sad" while letting a real confession through.
 *
 * There is no character minimum at all. Length is a bad proxy for meaning in
 * every script, and it was the rule doing the damage.
 */
export const MIN_WORDS = 2;
/** Scripts written without spaces are measured in letters. */
export const MIN_LETTERS_NO_SPACE = 6;

/**
 * Scripts that do not put spaces between words, where a word count is
 * meaningless: Han, Hiragana, Katakana, Thai, Lao, Khmer, Myanmar.
 * "我从来没有爱过他" is a complete sentence in 8 characters.
 */
const NO_SPACE_SCRIPT =
  /[㐀-䶿一-鿿぀-ゟ゠-ヿ฀-๿຀-໿ក-៿က-႟]/u;

const LETTER   = /\p{L}/u;
const LETTERS  = /\p{L}/gu;
const WORDS    = /\p{L}+/gu;

function letters(text: string): string[] {
  return text.match(LETTERS) ?? [];
}

function words(text: string): string[] {
  return text.match(WORDS) ?? [];
}

/** Is this text mostly written in a script that does not use spaces? */
function isNoSpaceScript(text: string): boolean {
  const ls = letters(text);
  if (ls.length === 0) return false;
  const noSpace = ls.filter((c) => NO_SPACE_SCRIPT.test(c)).length;
  return noSpace / ls.length >= 0.5;
}

// ─── Contact details ─────────────────────────────────────────────────────────

const TLD = '(?:com|in|net|org|io|me|app|co|uk|dev|xyz|link|site|shop|info|biz)';

const URL_RE    = new RegExp(`(?:https?:\\/\\/|www\\.)\\S+|\\b[\\w-]+\\.${TLD}\\b`, 'iu');
const EMAIL_RE  = /[\w.+-]+@[\w-]+\.[\w.-]+/u;
/** @ plus at least three characters — long enough to be a handle, not an aside. */
const HANDLE_RE = /@[\w.]{3,}/u;
/**
 * A run of digits with optional spaces, dashes and a leading +, carrying at
 * least ten digits. Anchored on digits at both ends so it cannot span words:
 * "I was 17 in 2009" has six digits in total but no run longer than four, and
 * must never be read as a phone number.
 */
const PHONE_RE  = /\+?\d[\d\s-]{8,}\d/u;

function looksLikeContact(text: string): boolean {
  if (EMAIL_RE.test(text) || URL_RE.test(text) || HANDLE_RE.test(text)) return true;
  const m = text.match(PHONE_RE);
  if (!m) return false;
  return (m[0].match(/\d/g) ?? []).length >= 10;
}

// ─── Layer 1 ─────────────────────────────────────────────────────────────────

/**
 * Deterministic, language-agnostic, conservative. Returns a reason code, or
 * null if nothing obvious is wrong.
 *
 * Order matters, because several rules can fire on the same text and the code
 * decides which message the writer sees. "aaaaaaaaaaaa" is both one word and
 * one repeated letter; "repetition" is the more accurate thing to say, so it
 * is tested first.
 */
export function checkLayer1(text: string): SubstanceReason | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 'too_short';

  const ls      = letters(trimmed);
  const nonSpace = trimmed.replace(/\s/gu, '').length;

  // Nothing but emoji, digits or punctuation.
  if (ls.length === 0) return 'no_letters';

  // Contact details are checked BEFORE the letter-ratio rule, not after.
  // "call me 98765 43210" is 6 letters against 16 non-space characters, so the
  // ratio rule fires first and tells someone who wrote a real sentence that it
  // has "no letters". The phone number is the actual problem and the actionable
  // message ("Keep it anonymous") is the one about contact details.
  if (looksLikeContact(trimmed)) return 'contact_or_link';

  // Mostly emoji, digits or punctuation with a stray letter or two.
  if (nonSpace > 0 && ls.length / nonSpace < 0.5) return 'no_letters';

  // One character held down, or one word repeated.
  if (trimmed.length >= 20 || ls.length >= 10) {
    const distinct = new Set(ls.map((c) => c.toLowerCase())).size;
    if (ls.length > 0 && distinct / ls.length < 0.15) return 'repetition';
  }
  const ws = words(trimmed);
  if (ws.length >= 4) {
    const counts = new Map<string, number>();
    for (const w of ws) {
      const k = w.toLowerCase();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const most = Math.max(...counts.values());
    if (most / ws.length >= 0.6) return 'repetition';
  }

  // Length floor. A no-space script is measured in letters, not words — the
  // 10-character minimum would reject a complete Chinese sentence.
  if (isNoSpaceScript(trimmed)) {
    if (ls.length < MIN_LETTERS_NO_SPACE) return 'too_short';
  } else if (ws.length < MIN_WORDS) {
    return 'too_short';
  }

  return null;
}

// ─── Layer 2 ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  'You screen posts for an anonymous confession app. Decide whether the text ' +
  'is a genuine attempt to share something personal — a feeling, experience, ' +
  'memory, secret, regret or thought — in ANY language or script, including ' +
  'transliterated text such as Hinglish, slang, typos, and very short but ' +
  "meaningful statements ('I never loved him.'). Answer NOT_GENUINE only for " +
  'keyboard mashing, gibberish, test or placeholder text, random words with no ' +
  'personal meaning, or spam/promotion. When unsure, answer GENUINE. ' +
  'Reply with exactly GENUINE or NOT_GENUINE.';

export interface Layer2Deps {
  apiKey?: string | null;
  fetchImpl?: typeof fetch;
}

/**
 * Meaning check. Its own call, deliberately not folded into
 * classifyCategories: that one fails open silently and returns a category
 * list, so overloading it would tie a quality verdict to a recommendation
 * detail and make both harder to reason about.
 *
 * Returns null when it could not reach a verdict — caller treats that as
 * 'unchecked' and ALLOWS the post.
 */
export async function checkLayer2(
  text: string,
  deps: Layer2Deps = {},
): Promise<boolean | null> {
  const apiKey = deps.apiKey;
  if (!apiKey) return null;
  const doFetch = deps.fetchImpl ?? fetch;

  try {
    const res = await doFetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        model:       'gpt-4o-mini',
        temperature: 0,
        max_tokens:  4,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: text },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const answer = String(data?.choices?.[0]?.message?.content ?? '').trim().toUpperCase();

    // Strict: anything that is not exactly one of the two tokens is "no
    // verdict", never a rejection. A model that starts explaining itself must
    // not cost someone their confession.
    if (answer === 'GENUINE')     return true;
    if (answer === 'NOT_GENUINE') return false;
    return null;
  } catch {
    return null;
  }
}

// ─── The gate ────────────────────────────────────────────────────────────────

/**
 * Full check. Layer 1 always; Layer 2 only if Layer 1 found nothing and a key
 * is configured.
 *
 * Fails OPEN by construction: every path that is not an explicit rejection
 * returns ok.
 */
export async function checkSubstance(
  text: string,
  deps: Layer2Deps = {},
): Promise<SubstanceResult> {
  const layer1 = checkLayer1(text);
  if (layer1) return { ok: false, reason: layer1 };

  const verdict = await checkLayer2(text, deps);
  if (verdict === false) return { ok: false, reason: 'not_genuine' };
  if (verdict === true)  return { ok: true,  check: 'passed' };
  return { ok: true, check: 'unchecked' };
}
