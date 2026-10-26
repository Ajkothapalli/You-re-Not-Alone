/**
 * [H1] HEADLINES — a short pull-quote, lifted word for word from the writer.
 *
 * Every confession can carry a 2–8 word headline shown in bold above the
 * full text. The headline is a PHRASE COPIED VERBATIM from the confession.
 * It is never an invented title, never a summary, never a rewrite.
 *
 * ── Why verbatim is the whole design, not a preference ──────────────────────
 * The model is the thing writing the most prominent line on a stranger's
 * confession. If it may paraphrase, then the boldest words on the card are
 * the model's words attributed, by position, to a person who did not say
 * them — on a surface with NO REPLY CHANNEL, so they cannot object, correct
 * it, or even know. Verbatim is what keeps the loudest line on the card the
 * writer's own.
 *
 * So the model does not produce text here. It produces a SELECTION, and the
 * server checks that the selection is real: normalise, then require the
 * phrase to be a literal substring of the confession. A model that
 * paraphrases, embellishes or invents fails that check and its output is
 * thrown away.
 *
 * ── Every failure falls back, and the fallback is safe ──────────────────────
 * No API key, API down, timeout, malformed JSON, paraphrase, over-length,
 * a name, a self-harm lead — all land on the same two outcomes: the writer's
 * own opening words, or nothing at all. A headline must NEVER block a post
 * and must never be the reason someone's confession fails.
 *
 * That asymmetry is what licenses the heuristics below to be blunt. In
 * substance.ts a false positive costs a real person their confession, so it
 * fails open and stays thin. Here a false positive costs a slightly duller
 * headline — the opening words the writer chose anyway — so the checks can
 * afford to be strict and are deliberately tuned that way.
 *
 * ── Never logged ────────────────────────────────────────────────────────────
 * Not the text, not the headline. The only thing worth emitting is which of
 * the three outcomes happened, and that carries no content.
 */

export type HeadlineSource = 'model' | 'fallback' | 'none';

export interface HeadlineResult {
  /** null means the confession gets no headline, which is always allowed. */
  headline: string | null;
  source:   HeadlineSource;
}

export interface HeadlineDeps {
  apiKey?:    string | null;
  fetchImpl?: typeof fetch;
  /** Overridden in tests so a timeout can be exercised without waiting. */
  timeoutMs?: number;
}

/** The database CHECK is the same number. Keep them in step. */
export const MAX_HEADLINE_CHARS = 60;
export const MIN_HEADLINE_WORDS = 2;
export const MAX_HEADLINE_WORDS = 8;

/**
 * Below this, the confession IS its own headline.
 *
 * "I cheated on him and I feel nothing." is eight words. Putting two of those
 * words in bold directly above the other eight is not a headline, it is a
 * stutter — and it steals the impact of a line whose whole force is that it
 * is short.
 */
export const MIN_TEXT_WORDS = 12;

/** The fallback is shorter than the cap: it is a cut, and it should look it. */
export const FALLBACK_MAX_CHARS = 48;

/**
 * Best-effort means bounded. 1.5s is long enough for gpt-4o-mini to return a
 * handful of tokens and short enough that a hung API is invisible to someone
 * waiting for their confession to post.
 */
export const HEADLINE_TIMEOUT_MS = 1_500;

// ─── Text shape ──────────────────────────────────────────────────────────────

/**
 * Scripts written without spaces between words, where counting words is
 * meaningless. Same list and same reasoning as substance.ts: "我从来没有爱过他"
 * is a complete sentence in eight characters and zero spaces.
 */
const NO_SPACE_SCRIPT =
  /[㐀-䶿一-鿿぀-ゟ゠-ヿ฀-๿຀-໿ក-៿က-႟]/u;

const LETTERS = /\p{L}/gu;
const WORDS   = /\p{L}[\p{L}\p{M}'’-]*/gu;

function letters(text: string): string[] {
  return text.match(LETTERS) ?? [];
}

export function words(text: string): string[] {
  return text.match(WORDS) ?? [];
}

/** Majority of letters in a script that does not separate words with spaces. */
export function isNoSpaceScript(text: string): boolean {
  const ls = letters(text);
  if (ls.length === 0) return false;
  return ls.filter((c) => NO_SPACE_SCRIPT.test(c)).length / ls.length >= 0.5;
}

/**
 * How long a phrase is, in the unit that means something for its script.
 *
 * A word count of a Chinese phrase is always 1, so a space-counting rule
 * would reject every headline in half the world's scripts and quietly give
 * those readers the fallback forever. Spaceless scripts are measured in
 * characters instead, on roughly the same scale: 2–8 English words is about
 * 4–24 Han characters.
 */
export function phraseLength(text: string): { units: number; min: number; max: number } {
  if (isNoSpaceScript(text)) {
    return { units: letters(text).length, min: 4, max: 24 };
  }
  return { units: words(text).length, min: MIN_HEADLINE_WORDS, max: MAX_HEADLINE_WORDS };
}

// ─── Normalisation ───────────────────────────────────────────────────────────

/**
 * Fold away the differences that are formatting rather than content, so that
 * "the day I stopped calling" matches "The day I stopped calling," in the
 * source.
 *
 * Deliberately NOT folded: punctuation inside the phrase, and letters. A
 * headline that changes a word is a paraphrase, and this function must not
 * be the reason one slips through.
 */
export function normalise(text: string): string {
  return normaliseWithMap(text).norm;
}

/**
 * The same normalisation, plus where each output character came from.
 *
 * This is what lets the matched span be cut out of the ORIGINAL text rather
 * than trusted from the model's echo. It matters twice over: the stored
 * headline is then literally the writer's characters — their capitalisation,
 * their apostrophes — and the proper-noun check below runs on the casing
 * THEY used, not on whatever case the model happened to reply in.
 *
 * Without it, a model that Title Cases a perfectly good selection ("The Day
 * I Stopped Calling") looks like four proper nouns and gets thrown away.
 */
export function normaliseWithMap(text: string): { norm: string; map: number[] } {
  const norm: string[] = [];
  const map:  number[] = [];
  let pendingSpace = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (/\s/.test(ch)) { pendingSpace = norm.length > 0; continue; }

    if (pendingSpace) { norm.push(' '); map.push(i); pendingSpace = false; }

    let out = ch;
    if ('‘’‚‛′'.includes(ch))      out = "'";
    else if ('“”„‟″'.includes(ch)) out = '"';
    else if ('‐‑‒–—―'.includes(ch)) out = '-';
    norm.push(out.toLowerCase());
    map.push(i);
  }

  return { norm: norm.join(''), map };
}

/**
 * Strip a wrapping pair of quotes the model added around its selection.
 *
 * Only a MATCHED outer pair, and only when the phrase does not contain that
 * same quote inside — otherwise this would silently edit a phrase whose
 * quotes are the writer's own.
 */
export function stripWrappingQuotes(raw: string): string {
  let s = raw.trim();
  for (const [open, close] of [['"', '"'], ["'", "'"], ['“', '”'], ['‘', '’']]) {
    if (s.length >= 2 && s.startsWith(open) && s.endsWith(close)) {
      const inner = s.slice(1, -1);
      if (!inner.includes(open) && !inner.includes(close)) { s = inner.trim(); }
    }
  }
  return s;
}

// ─── What a headline may not lead with ───────────────────────────────────────

/**
 * Deterministic, and deliberately crude.
 *
 * Crisis text never reaches this module — the crisis check hard-returns
 * before it in both callers — but a confession can mention wanting to die
 * without tripping the crisis classifier. A headline is the LOUDEST line on
 * the card and, in a feed, the line a reader sees before they have chosen to
 * read anything. "i wanted to die" set in bold at the top of a scroll is
 * exactly what the rule against leading with self-harm exists to stop.
 *
 * Applied to the model's pick AND to the fallback. This is the one check the
 * fallback cannot skip: if someone's confession OPENS with these words, the
 * opening-words fallback would lead with them by construction, and the right
 * answer there is no headline at all.
 */
const LEAD_BLOCKLIST = [
  'kill myself', 'killing myself', 'kill me', 'end my life', 'ending my life',
  'take my own life', 'want to die', 'wanted to die', 'wish i was dead',
  'wish i were dead', 'better off dead', 'suicide', 'suicidal',
  'self harm', 'self-harm', 'cutting myself', 'cut myself', 'overdose',
  'hang myself', 'hanging myself', 'jump off', 'slit my',
  'raped', 'rape me', 'molested', 'abused me', 'beat me',
];

export function leadsWithBlocked(headline: string): boolean {
  const n = normalise(headline);
  return LEAD_BLOCKLIST.some((p) => n.includes(p));
}

// ─── Names, places, workplaces ───────────────────────────────────────────────

/**
 * Catch a proper noun the model pulled out of the middle of a sentence.
 *
 * This is the harm the phase most needs to avoid: a writer mentions a person
 * once, buried in the third line, and the headline promotes that name into
 * bold at the top of a stranger's feed — a named third party on a surface
 * with no reply channel, which is the same rule the sentence starters and
 * the weekly question already live by.
 *
 * The heuristic: a capitalised token that is NOT the first word of a
 * sentence in the source text is probably a proper noun. Exemptions for "I"
 * and its contractions, which are capitalised everywhere in English.
 *
 * ── What it does NOT catch, said plainly ────────────────────────────────────
 * A name at the START of a sentence is indistinguishable from an ordinary
 * capitalised sentence opening, and this will pass it. A name in a script
 * with no capitalisation — Devanagari, Han, Arabic — is invisible to it
 * entirely. The prompt asks the model not to pick those, and nothing here
 * verifies that it obeyed. This narrows the hole; it does not close it.
 *
 * False positives are fine and expected (a brand, a weekday, a place the
 * writer capitalised) — they cost the fallback, which is cheap.
 */
export function looksLikeProperNoun(headline: string, text: string): boolean {
  const tokens = headline.trim().split(/\s+/).filter(Boolean);

  // Every position in the source where a sentence begins, lowercased, so a
  // legitimately capitalised opener is not mistaken for a name.
  const sentenceStarts = new Set(
    (normalise(text).match(/(?:^|[.!?]\s+)([\p{L}][\p{L}\p{M}'’-]*)/gu) ?? [])
      .map((m) => m.replace(/^[.!?]\s+/, '').trim()),
  );

  return tokens.some((tokenRaw, i) => {
    const token = tokenRaw.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
    if (token.length < 2) return false;
    const first = token[0];
    // Only meaningful in bicameral scripts. \p{Lu} is false for Devanagari.
    if (first !== first.toUpperCase() || first === first.toLowerCase()) return false;
    // "I", "I'm", "I've" — capitalised by grammar, not by being a name.
    if (/^i(['’](m|ve|ll|d))?$/i.test(token)) return false;
    // The headline's own first word inherits whatever case it had in the
    // source, so it is judged only by the sentence-start test below.
    if (i === 0 && sentenceStarts.has(token.toLowerCase())) return false;
    return !sentenceStarts.has(token.toLowerCase());
  });
}

// ─── Validation ──────────────────────────────────────────────────────────────

export type RejectReason =
  | 'empty' | 'not_verbatim' | 'too_long' | 'wrong_length' | 'blocked_lead' | 'proper_noun';

export interface Validation {
  ok:      boolean;
  reason?: RejectReason;
  /** The phrase as it should be stored — trimmed, quotes unwrapped. */
  value?:  string;
}

/**
 * The server's own check on the model's selection.
 *
 * Runs on EVERY model output, including in the backfill. Nothing reaches the
 * database without passing this, which is what makes "verbatim" a property
 * of the system rather than a request made politely to a model.
 */
export function validateHeadline(raw: string, text: string): Validation {
  const picked = stripWrappingQuotes(String(raw ?? ''));
  if (!picked) return { ok: false, reason: 'empty' };

  if (picked.length > MAX_HEADLINE_CHARS) return { ok: false, reason: 'too_long' };

  const { units, min, max } = phraseLength(picked);
  if (units < min || units > max) return { ok: false, reason: 'wrong_length' };

  // THE check. Normalised on both sides so case, curly quotes and collapsed
  // whitespace do not count as a rewrite — and nothing else does either.
  const source = normaliseWithMap(text);
  const needle = normalise(picked);
  const at = source.norm.indexOf(needle);
  if (at < 0) return { ok: false, reason: 'not_verbatim' };

  /**
   * Cut the span out of the ORIGINAL, rather than storing the model's echo.
   *
   * The model is a selector, so what it returns is a pointer, not content.
   * Taking the characters from the source is what makes the stored headline
   * the writer's own down to the apostrophe — and it is the difference
   * between a headline that is verbatim and one that merely matched.
   */
  const start = source.map[at];
  const end   = source.map[at + needle.length - 1] + 1;
  /**
   * Trailing connective punctuation is trimmed, and nothing else is.
   *
   * A phrase cut out of the middle of a sentence often ends on a comma, and
   * "Log kya kahenge," set in bold reads as a rendering bug rather than as a
   * quote — the reader sees a headline that got chopped. A terminal . ! ? is
   * KEPT: that is a finished sentence and looks deliberate.
   *
   * Still verbatim: dropping the last character of a substring leaves a
   * substring. No word is changed, added or reordered.
   */
  const value = text.slice(start, end).trim().replace(/[,;:–—-]+$/, '').trim();

  if (value.length > MAX_HEADLINE_CHARS) return { ok: false, reason: 'too_long' };
  if (leadsWithBlocked(value))           return { ok: false, reason: 'blocked_lead' };
  // Judged on the writer's capitalisation, not the model's.
  if (looksLikeProperNoun(value, text))  return { ok: false, reason: 'proper_noun' };

  return { ok: true, value };
}

// ─── The fallback ────────────────────────────────────────────────────────────

/**
 * The writer's own opening words, cut at a word boundary.
 *
 * Verbatim by construction — it is a prefix of what they wrote — so it needs
 * no substring check. It is not run through the proper-noun heuristic
 * either: this is the first line of the confession, which is already the
 * most visible text on the card and is printed in full directly underneath.
 * Hiding it in the headline while showing it one line below would be
 * theatre. The self-harm blocklist DOES apply — see its note.
 */
export function fallbackHeadline(text: string): string | null {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return null;

  // First sentence, or the whole thing if it has no terminator.
  const firstSentence = flat.split(/(?<=[.!?])\s/)[0] ?? flat;

  let out: string;
  if (firstSentence.length <= FALLBACK_MAX_CHARS) {
    out = firstSentence;
  } else if (isNoSpaceScript(firstSentence)) {
    // No word boundaries to cut on; cut on characters.
    out = firstSentence.slice(0, FALLBACK_MAX_CHARS).trim() + '…';
  } else {
    const cut = firstSentence.slice(0, FALLBACK_MAX_CHARS + 1);
    const lastSpace = cut.lastIndexOf(' ');
    // A single word longer than the cap has no boundary to fall back to.
    out = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut.slice(0, FALLBACK_MAX_CHARS))
      .replace(/[\s,;:–—-]+$/, '') + '…';
  }

  if (leadsWithBlocked(out)) return null;
  return out;
}

// ─── The model ───────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = [
  'You select a pull-quote from an anonymous confession. You never write one.',
  '',
  'Return the single most striking phrase that appears VERBATIM in the text and',
  'would make a stranger want to read the rest.',
  '',
  'Hard rules:',
  '- COPY THE PHRASE EXACTLY, character for character, from the text. Do not',
  '  rewrite, summarise, translate, correct spelling, fix grammar, or change a',
  '  single word. If you cannot copy one exactly, return an empty string.',
  '- Between 2 and 8 words, and at most 60 characters.',
  '- Never pick a phrase containing a person\'s name, a place, or a workplace.',
  '- Never lead with self-harm, suicide, abuse detail, sexual or graphic content.',
  '- Prefer the emotional turn over the setup. Not the first words by default.',
  '',
  'Respond with JSON only: {"headline": "<exact phrase, or empty string>"}',
].join('\n');

/**
 * Ask the model for a selection, verify it, and fall back on anything at all
 * going wrong.
 *
 * Every return path is a valid result. There is no throw and no rejection:
 * the callers run this inside their own try/catch anyway, but a headline
 * generator that can fail a submission would be a bug of a different order
 * to a headline generator that returns the wrong phrase.
 */
export async function pickHeadline(
  text: string,
  deps: HeadlineDeps = {},
): Promise<HeadlineResult> {
  const source = String(text ?? '');

  // Short confessions get nothing — see MIN_TEXT_WORDS.
  const { units } = phraseLength(source);
  const shortText = isNoSpaceScript(source)
    ? units < 24
    : units < MIN_TEXT_WORDS;
  if (shortText) return { headline: null, source: 'none' };

  const fallback = (): HeadlineResult => {
    const fb = fallbackHeadline(source);
    return fb ? { headline: fb, source: 'fallback' } : { headline: null, source: 'none' };
  };

  if (!deps.apiKey) return fallback();

  const doFetch  = deps.fetchImpl ?? fetch;
  const timeout  = deps.timeoutMs ?? HEADLINE_TIMEOUT_MS;
  const control  = new AbortController();
  const timer    = setTimeout(() => control.abort(), timeout);

  try {
    const res = await doFetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      signal:  control.signal,
      headers: {
        'Authorization': `Bearer ${deps.apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        model:           'gpt-4o-mini',
        temperature:     0,
        max_tokens:      40,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: source },
        ],
      }),
    });

    if (!res.ok) return fallback();

    const data = await res.json();
    const content = String(data?.choices?.[0]?.message?.content ?? '');

    let picked = '';
    try {
      picked = String((JSON.parse(content) as { headline?: unknown })?.headline ?? '');
    } catch {
      // Not JSON despite response_format. Not worth guessing at.
      return fallback();
    }

    const verdict = validateHeadline(picked, source);
    // The model's output is discarded on any rejection — including the ones
    // it could have avoided. It gets no second attempt: a retry loop in front
    // of a post is latency spent on a decoration.
    if (!verdict.ok || !verdict.value) return fallback();

    return { headline: verdict.value, source: 'model' };
  } catch {
    // Abort, network error, malformed response — all the same outcome.
    return fallback();
  } finally {
    clearTimeout(timer);
  }
}
