/**
 * [N1] The rules that decide whether, when and what to send.
 *
 * Pure. No database, no clock, no network — the sender gathers rows and
 * hands them here, and every hard question (is this quiet hours in Kolkata?
 * has this account already had two today? what does the body say?) becomes
 * a function a test can call with any input.
 *
 * That split matters more than usual here. A push is the one surface a
 * person has not chosen to look at: it arrives on a lock screen, possibly
 * in front of somebody else, possibly at 3am. Every one of these rules is
 * about not doing that, and none of them can be verified by looking at a
 * screen afterwards.
 *
 * ── The never-list ──────────────────────────────────────────────────────────
 * No confession text, no headline, no id, no name, no upsell, no plan, no
 * referral reward, nothing about crisis. `buildMessage` takes COUNTS and a
 * question string and cannot see a confession at all — the type signature
 * is the enforcement, and push_outbox.counts (numbers only, by CHECK) is
 * the second one.
 */

export type PushKind = 'felt' | 'question';

export interface DeviceRow {
  expo_token:  string;
  tz:          string;
  discreet:    boolean;
  quiet_hours: boolean;
  felt_on:     boolean;
  question_on: boolean;
  disabled_at: string | null;
}

export interface OutboxRow {
  id:         string;
  account_id: string;
  kind:       PushKind;
  counts:     Record<string, number>;
  not_before: string;
}

// ─── Quiet hours ─────────────────────────────────────────────────────────────

export const QUIET_START_HOUR = 22;   // 22:00
export const QUIET_END_HOUR   = 8;    // 08:00
/** Where a deferred push lands: the morning, not the instant quiet ends. */
export const DEFER_TO_HOUR    = 9;

/**
 * The hour of day in a timezone, from an instant.
 *
 * Intl rather than arithmetic on purpose. An offset table gets DST wrong
 * twice a year, and "wrong twice a year" for this feature means waking
 * somebody at 3am twice a year.
 */
export function hourIn(tz: string, at: Date): number {
  try {
    const s = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', hour12: false,
    }).format(at);
    const h = Number(s);
    return Number.isFinite(h) ? h % 24 : at.getUTCHours();
  } catch {
    // An unknown tz string must not stop the send; UTC is the safe default
    // because the quiet window is then still applied, just in the wrong
    // place — better than not applied at all.
    return at.getUTCHours();
  }
}

/** Local parts of an instant in a timezone. */
export function partsIn(tz: string, at: Date): { y: number; m: number; d: number; hour: number; weekday: string } {
  try {
    const f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', hour12: false, weekday: 'short',
    });
    const got: Record<string, string> = {};
    for (const p of f.formatToParts(at)) got[p.type] = p.value;
    return {
      y: Number(got.year), m: Number(got.month), d: Number(got.day),
      hour: Number(got.hour) % 24, weekday: got.weekday,
    };
  } catch {
    return {
      y: at.getUTCFullYear(), m: at.getUTCMonth() + 1, d: at.getUTCDate(),
      hour: at.getUTCHours(), weekday: at.toUTCString().slice(0, 3),
    };
  }
}

/** 22:00–07:59 local. Wraps midnight, which is the half people get wrong. */
export function isQuietHour(tz: string, at: Date): boolean {
  const h = hourIn(tz, at);
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
}

/**
 * The next 09:00 local, as an instant.
 *
 * Computed by search rather than by constructing a local date: building a
 * Date "in" an arbitrary IANA zone from parts is not something the standard
 * library does, and the usual workarounds are exactly where DST bugs live.
 * Stepping forward an hour at a time and asking the formatter is slower and
 * correct, and this runs a handful of times per batch.
 */
export function nextMorning(tz: string, at: Date): Date {
  const cursor = new Date(at.getTime());
  // Round up to the next whole hour so the search terminates cleanly.
  cursor.setUTCMinutes(0, 0, 0);
  cursor.setUTCHours(cursor.getUTCHours() + 1);
  // 48 hours of headroom covers any offset plus a DST transition.
  for (let i = 0; i < 48; i++) {
    if (hourIn(tz, cursor) === DEFER_TO_HOUR) return cursor;
    cursor.setUTCHours(cursor.getUTCHours() + 1);
  }
  // Unreachable in practice. Returning `at` sends now rather than never —
  // a push at a slightly wrong time beats a queue that silently stops.
  return at;
}

// ─── The daily cap ───────────────────────────────────────────────────────────

/**
 * Two per account per local day.
 *
 * Not three, and not "two of each". Somebody who gets a felt push and the
 * Monday question has had both things this product does; a third is the app
 * talking for its own sake, and the reliable consequence of that is the OS
 * toggle being switched off for good.
 */
export const DAILY_CAP = 2;

export type Verdict =
  | { action: 'send';  body: string; title: string }
  | { action: 'defer'; notBefore: Date; reason: 'quiet_hours' | 'daily_cap' }
  | { action: 'skip';  reason: 'disabled' | 'kind_off' | 'no_device' | 'empty' };

export interface DecideInput {
  row:        OutboxRow;
  device:     DeviceRow | null;
  /** Pushes already SENT to this account in its local day. */
  sentToday:  number;
  /** The live question's text. Required for kind 'question'. */
  questionText?: string | null;
  now:        Date;
}

/**
 * What to do with one queued push for one device.
 *
 * Order matters: the skips come before the defers, so a device that has the
 * kind switched off is dropped rather than rescheduled forever, and a
 * deferred row keeps its place in the queue rather than being counted
 * against tomorrow's cap today.
 */
export function decidePush(input: DecideInput): Verdict {
  const { row, device, sentToday, now } = input;

  if (!device)             return { action: 'skip', reason: 'no_device' };
  if (device.disabled_at)  return { action: 'skip', reason: 'disabled' };

  if (row.kind === 'felt'     && !device.felt_on)     return { action: 'skip', reason: 'kind_off' };
  if (row.kind === 'question' && !device.question_on) return { action: 'skip', reason: 'kind_off' };

  // A question push with no live question says nothing. Skip rather than
  // send an empty one.
  if (row.kind === 'question' && !input.questionText) {
    return { action: 'skip', reason: 'empty' };
  }

  // Quiet hours BEFORE the cap: a push deferred to the morning has not been
  // sent, so it should not consume today's allowance on its way past.
  if (device.quiet_hours && isQuietHour(device.tz, now)) {
    return { action: 'defer', notBefore: nextMorning(device.tz, now), reason: 'quiet_hours' };
  }

  if (sentToday >= DAILY_CAP) {
    // Tomorrow morning, not "in 24 hours". A stale felt row waiting
    // overnight is merged by the trigger's dedupe key if more felts land,
    // so what arrives is one push with a bigger number, never a stack.
    return { action: 'defer', notBefore: nextMorning(device.tz, now), reason: 'daily_cap' };
  }

  return {
    action: 'send',
    ...buildMessage(row.kind, row.counts, device.discreet, input.questionText ?? null),
  };
}

// ─── Wording ─────────────────────────────────────────────────────────────────

export const DISCREET_TITLE = 'Something new for you';

/**
 * The words that appear on a lock screen.
 *
 * Takes COUNTS and a question string. It cannot see a confession, an id or
 * an account, and that is the enforcement — not a rule someone remembers.
 *
 * The felt counts are HUMAN felts only (W3): the number comes from
 * real_felt_count, never from felt_count, which carries fabricated seed
 * values. Telling somebody that thirty people felt their words when the
 * number was invented is the worst lie this app could tell.
 */
export function buildMessage(
  kind: PushKind,
  counts: Record<string, number>,
  discreet: boolean,
  questionText: string | null,
): { title: string; body: string } {
  if (discreet) {
    // Every kind, one line, no detail. For a shared or visible phone.
    return { title: DISCREET_TITLE, body: '' };
  }

  if (kind === 'felt') {
    const n = Math.max(1, Math.floor(counts.n ?? 1));
    return {
      title: 'soulyap',
      // "n more people", not "n people": they have already been told about
      // the first one, and restating the total would read as the same
      // notification arriving twice.
      body: n === 1
        ? 'Someone felt what you wrote.'
        : `${n} more people felt what you wrote.`,
    };
  }

  return {
    title: "This week's question is here.",
    body:  questionText ?? '',
  };
}

// ─── The payload ─────────────────────────────────────────────────────────────

export type PushRoute = '/notifications' | '/explore';

/**
 * Everything the app receives with a push.
 *
 * A route and nothing else — whitelisted, not filtered. Building the object
 * from scratch means a field cannot be added by accident somewhere upstream
 * and ride along; anything not named here simply does not exist by the time
 * this returns.
 */
export function buildData(kind: PushKind): { route: PushRoute } {
  return { route: kind === 'felt' ? '/notifications' : '/explore' };
}

// ─── The weekly question window ──────────────────────────────────────────────

/** Monday 19:00–19:59 in the device's own timezone. */
export function isQuestionHour(tz: string, at: Date): boolean {
  const p = partsIn(tz, at);
  return p.weekday.startsWith('Mon') && p.hour === 19;
}

/** ISO-ish week key for the question dedupe. Same week = same key. */
export function isoWeekKey(at: Date): string {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Devices this stale are not worth waking. */
export const QUESTION_ACTIVE_DAYS = 30;
