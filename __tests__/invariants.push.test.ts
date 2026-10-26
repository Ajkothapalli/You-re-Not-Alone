/**
 * [N1] What a push may never contain, and who may never ask for permission.
 *
 * A push is the one surface the writer cannot see, cannot control and did
 * not agree to. It lands on a lock screen, possibly in front of somebody
 * else. Both halves of this file guard things that fail silently and only
 * become visible after they have already happened to a real person.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

// ─── Nothing about a confession reaches a lock screen ────────────────────────

describe('a push body can only ever be built from counts', () => {
  const rules = strip(read('supabase', 'functions', '_shared', 'pushRules.ts'));

  it('buildMessage receives numbers and one approved question, nothing else', () => {
    // The type signature is the enforcement. It cannot see a confession
    // because it is never handed one.
    expect(rules).toMatch(
      /export function buildMessage\(\s*kind: PushKind,\s*counts: Record<string, number>/);
  });

  it('no confession field is reachable from the message builder', () => {
    const at = rules.indexOf('export function buildMessage');
    const fn = rules.slice(at, rules.indexOf('\n}', rules.indexOf('return {', at)));
    for (const forbidden of [/\.text\b/, /headline/i, /confession/i, /account/i, /persona/i]) {
      expect(fn).not.toMatch(forbidden);
    }
  });

  it('carries no upsell, plan or referral wording', () => {
    /**
     * Premium in a push would be an upsell on a surface nobody opted into.
     * The referral reward is worse: its timing is tied to the moment an
     * invitee's confession cleared the criteria, so a push about it tells
     * the inviter, by timing alone, that a specific person just wrote
     * something — the authorship link CLAUDE.md #3 forbids, through the
     * back door. Referral rewards are in-app only.
     */
    for (const forbidden of [
      /premium/i, /upgrade/i, /subscri/i, /\bplan\b/i, /supporter/i,
      /referral/i, /gift week/i, /invite/i, /unlock/i,
    ]) {
      expect(rules).not.toMatch(forbidden);
    }
  });

  it('says nothing about crisis', () => {
    expect(rules).not.toMatch(/crisis|helpline|suicide|self.harm/i);
  });

  it('the payload is a route and nothing else', () => {
    const at = rules.indexOf('export function buildData');
    const fn = rules.slice(at, rules.indexOf('\n}', at));
    expect(fn).toMatch(/return \{ route:/);
    // One key. Built from scratch so nothing can ride along.
    expect(fn).not.toMatch(/\.\.\./);
    expect(fn).not.toMatch(/id|text|token|account/i);
  });

  it('the sender builds its message only from the rules module', () => {
    const send = strip(read('supabase', 'functions', 'send-pushes', 'index.ts'));
    // title and body come from decidePush's verdict, never assembled here.
    expect(send).toMatch(/title:\s+verdict\.title/);
    expect(send).toMatch(/body:\s+verdict\.body/);
    // It never selects a confession at all.
    expect(send).not.toMatch(/from\('confessions'\)/);
  });

  it('the outbox schema refuses text, not just the code', () => {
    // Belt and braces: even if a future sender tried to read a string out
    // of counts, the column constraint means one could never be stored.
    const sql = read('supabase', 'migrations', '20260930000003_push.sql');
    expect(sql).toMatch(/push_outbox_counts_numeric/);
    expect(sql).toMatch(/jsonb_values_all_numeric\(counts\)/);
  });

  it('logs carry counts only', () => {
    const send = strip(read('supabase', 'functions', 'send-pushes', 'index.ts'));
    const logs = send.match(/console\.(log|error|warn)\([^)]*\)/g) ?? [];
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      // A log pairing an account with a confession would be the authorship
      // link, written somewhere nobody thinks to look.
      expect(line).not.toMatch(/account_id|confession|expo_token|\.body|\.title/);
    }
  });
});

// ─── Only two places may trigger the system dialog ───────────────────────────

describe('nothing asks the OS for permission on its own', () => {
  /**
   * The dialog can be shown once, ever. A stray call at launch, in
   * onboarding, or on a screen somebody reached by accident spends that one
   * chance at the worst possible moment — and it cannot be taken back.
   *
   * Exactly two callers are allowed: the card's primary button, and the
   * Settings master toggle. Both are a deliberate tap on a control that
   * says what it does.
   */
  const ALLOWED = [
    'lib/pushPermission.ts',   // the one wrapper both callers go through
  ];

  /**
   * `requestPermissionsAsync(` — the call, not the name.
   *
   * A type declaration (`requestPermissionsAsync: () => Promise<...>`) is
   * followed by a colon, so it does not match. Fresh per use: a /g regex
   * kept at module scope carries lastIndex between .test() calls and
   * silently skips every other file.
   */
  const CALLS_ASK = /requestPermissionsAsync\s*\(/;

  const sources = [
    ...walk(path.join(ROOT, 'app')),
    ...walk(path.join(ROOT, 'components')),
    ...walk(path.join(ROOT, 'lib')),
    ...walk(path.join(ROOT, 'hooks')),
  ];

  it('the NOTIFICATION dialog is triggered from one file only', () => {
    /**
     * Scoped to expo-notifications on purpose. lib/dictation.ts and
     * lib/voiceRecorder.ts both call requestPermissionsAsync for the
     * MICROPHONE and the speech recogniser — different APIs, different
     * dialogs, and both are already asked at the right moment (the first
     * tap on the mic). A guard that matched the bare method name would
     * flag them forever and teach the next person to widen the allow-list
     * until it means nothing.
     *
     * Matched as a CALL, not as a mention. lib/pushNative.ts has to name
     * the method in a type signature to describe the module it guards, and
     * declaring a function's shape is not showing anybody a dialog.
     */
    const offenders = sources.filter((f) => {
      const rel = path.relative(ROOT, f);
      if (ALLOWED.includes(rel)) return false;
      const src = strip(fs.readFileSync(f, 'utf8'));
      return /expo-notifications/.test(src) && CALLS_ASK.test(src);
    }).map((f) => path.relative(ROOT, f));

    expect(offenders).toEqual([]);
  });

  it('and the microphone ones are still the only other askers', () => {
    // Pinned so that if a THIRD kind of permission request appears,
    // somebody has to come here and say what it is and why.
    const askers = sources.filter((f) =>
      CALLS_ASK.test(strip(fs.readFileSync(f, 'utf8'))),
    ).map((f) => path.relative(ROOT, f)).sort();

    expect(askers).toEqual([
      'lib/dictation.ts',        // speech recogniser, on the first mic tap
      'lib/pushPermission.ts',   // notifications, from the card or Settings
      'lib/voiceRecorder.ts',    // microphone, on the first record tap
    ]);
  });

  it('expo-notifications is imported in exactly ONE file', () => {
    /**
     * The crash this guards, 2026-10-02.
     *
     * expo-notifications is a NATIVE module: its JS calls
     * requireNativeModule('ExpoPushTokenManager') at module scope, so on a
     * binary without the native side it THROWS during module evaluation —
     * before the importing file has run a line. app/_layout.tsx imported it
     * directly, the iOS client predated N1 adding the dependency, and the
     * app died at the root layout.
     *
     * Every call in lib/pushPermission.ts was already inside try/catch and
     * none of it mattered, because nothing had reached a call.
     *
     * It is not only a stale-dev-client problem: `eas update` reaches
     * installs built before this dependency existed, where a static import
     * is a boot crash that lands automatically with no store review in the
     * way. One guarded require, in one file.
     */
    const importers = sources.filter((f) =>
      /(?:from|require\()\s*['"]expo-notifications['"]/.test(strip(fs.readFileSync(f, 'utf8'))),
    ).map((f) => path.relative(ROOT, f)).sort();

    expect(importers).toEqual(['lib/pushNative.ts']);
  });

  it('and that one file loads it defensively', () => {
    // A static import here would move the crash rather than remove it.
    const native = strip(read('lib', 'pushNative.ts'));
    expect(native).not.toMatch(/^import .* from 'expo-notifications'/m);
    expect(native).toMatch(/require\('expo-notifications'\)/);
    expect(native).toMatch(/catch/);
  });

  it('push reads as OFF, not broken, when the module is absent', () => {
    // A toggle that does nothing, or a card that errors, is worse than a
    // build that simply has no notifications.
    const perm = strip(read('lib', 'pushPermission.ts'));
    expect(perm).toMatch(/if \(!N\) return/);
  });

  it('the card itself cannot trigger it', () => {
    // It reports a tap and nothing else. Keeping the API out of the
    // component is what makes "the dialog follows the explanation" a
    // structural fact rather than a convention.
    const card = strip(read('components', 'PushAskCard.tsx'));
    expect(card).not.toMatch(/expo-notifications|requestPermissionsAsync/);
  });

  it('nothing on the boot path asks', () => {
    for (const f of ['app/index.tsx', 'app/_layout.tsx', 'app/welcome.tsx', 'app/auth.tsx']) {
      const src = strip(read(...f.split('/')));
      expect([f, /requestPermissionsAsync/.test(src)]).toEqual([f, false]);
    }
  });

  it('nothing on the crisis or blocked path asks', () => {
    for (const f of ['app/crisis.tsx', 'app/blocked.tsx']) {
      const src = strip(read(...f.split('/')));
      expect([f, /requestPermissionsAsync|PushAskCard/.test(src)]).toEqual([f, false]);
    }
  });

  it('the eligibility module cannot ask either', () => {
    // Deciding whether to ask and actually asking are separate acts.
    expect(strip(read('lib', 'pushAsk.ts'))).not.toMatch(/expo-notifications/);
  });
});

// ─── The copy is owner-supplied and fixed ────────────────────────────────────

describe('the promise line', () => {
  const card = read('components', 'PushAskCard.tsx');

  it('is exactly the owner-supplied text', () => {
    // It is the only place a person is told what will NOT happen, and
    // "Never your words themselves" is the line that makes the rest safe
    // to say yes to.
    expect(card).toMatch(/Only two things: when someone feels your words, and Monday’s question\./);
    expect(card).toMatch(/Never your words themselves\. Quiet from 10pm to 8am\./);
  });

  it('promises nothing about speed', () => {
    /**
     * Pushes are batched on a 10-minute cron, capped at two a day and
     * deferred past quiet hours. "The moment" or "instantly" would be a
     * promise the system cannot keep, and the CCPA guidance treats a false
     * performance claim as a dark pattern.
     */
    const copy = card.slice(card.indexOf('export const COPY'), card.indexOf('TOAST_GRANTED'));
    for (const forbidden of [/\bthe moment\b/i, /instantl/i, /immediat/i, /right away/i, /real.?time/i]) {
      expect(copy).not.toMatch(forbidden);
    }
  });

  it('has no urgency and no guilt on the decline', () => {
    for (const forbidden of [
      /don'?t miss/i, /hurry/i, /last chance/i, /only \d+ left/i,
      /are you sure/i, /you'?ll regret/i, /no thanks, I don'?t/i,
    ]) {
      expect(card).not.toMatch(forbidden);
    }
    // The decline reads as a neutral answer, on every card.
    expect((card.match(/decline:\s+'Not now'/g) ?? []).length).toBe(3);
  });
});

// ─── The wiring (§4b, §5) ────────────────────────────────────────────────────

describe('the three moments are wired where the brief says', () => {
  it('A sits in Alerts, under the newest item', () => {
    const alerts = strip(read('app', '(tabs)', 'notifications.tsx'));
    expect(alerts).toMatch(/usePushAsk\(proofMoment\)/);
    // Only when the NEWEST item is an UNREAD felt. Further down the list it
    // is a card about something already scrolled past — a weaker ask, and
    // the one dialog is not worth spending on it.
    expect(alerts).toMatch(/newest\.type === 'felt' && !newest\.read_at/);
    expect(alerts).toMatch(/i === 0 && ask\.moment/);
  });

  it('B sits on the match sheet, which crisis and blocked never reach', () => {
    const match = strip(read('app', 'match.tsx'));
    expect(match).toMatch(/usePushAsk\('just_posted'\)/);
    // Both branches: matched and no-match.
    expect((match.match(/<PushAskCard/g) ?? []).length).toBe(2);
  });

  it('C follows the question, and only after the reader engaged with it', () => {
    const explore = strip(read('app', '(tabs)', 'explore.tsx'));
    // Not on merely SEEING the card — that is the weakest version of the ask.
    expect(explore).toMatch(/questionEngaged && !questionHidden \? 'question' : null/);
    expect(explore).toMatch(/setQuestionEngaged\(true\)/);
    /**
     * And it sits UNDER the question card, not somewhere else in the feed.
     *
     * This used to assert `case 'push_ask':` — the deck's page for it. The
     * deck is gone (2026-10-01) and the ask is back to one place: inside
     * the question's list header, below the card it follows from.
     */
    const header = explore.slice(explore.indexOf('const questionHeader'));
    const card   = header.indexOf('<QuestionCard');
    const ask    = header.indexOf('<PushAskCard');
    expect(card).toBeGreaterThan(-1);
    expect(ask).toBeGreaterThan(card);
  });

  it('C is never shown beside the targeted write invite', () => {
    // One ask at a time.
    const explore = strip(read('app', '(tabs)', 'explore.tsx'));
    expect(explore).toMatch(/otherAskOnScreen: !!invite/);
  });

  it('the card never appears on crisis or blocked, and both flag the session', () => {
    for (const f of ['app/crisis.tsx', 'app/blocked.tsx']) {
      const src = strip(read(...f.split('/')));
      expect([f, /PushAskCard|usePushAsk/.test(src)]).toEqual([f, false]);
      // And they tell pushAsk, so the NEXT screen this session does not ask
      // either.
      expect([f, /markCrisisOrBlock\(\)/.test(src)]).toEqual([f, true]);
    }
  });
});

describe('the token follows the session', () => {
  it.each(['app/settings.tsx', 'app/(tabs)/you.tsx'])(
    '%s removes this device\'s token on sign-out', (f) => {
      // Before the session ends — the call is authenticated, so afterwards
      // there is no way to make it.
      const src = strip(read(...f.split('/')));
      const fn  = src.slice(src.indexOf('async function handleSignOut'));
      const body = fn.slice(0, fn.indexOf('signOut()'));
      expect([f, /unregisterPushToken/.test(body)]).toEqual([f, true]);
    });

  it('launch refreshes last_seen_at without ever requesting', () => {
    const layout = strip(read('app', '_layout.tsx'));
    expect(layout).toMatch(/touchPushDevice/);
    // existingToken returns null rather than prompting when permission is
    // not already granted — that is what makes this safe on the boot path.
    expect(layout).toMatch(/existingToken\(\)/);
    expect(layout).not.toMatch(/requestPermissionsAsync/);
  });

  it('a cold-start tap is handled, not just a warm one', () => {
    // The classic bug: only registering the listener means tapping a push
    // that LAUNCHED the app opens whatever screen it last had.
    const layout = strip(read('app', '_layout.tsx'));
    expect(layout).toMatch(/getLastNotificationResponseAsync/);
    expect(layout).toMatch(/addNotificationResponseReceivedListener/);
  });

  it('a push route is whitelisted, not trusted', () => {
    // The one piece of routing input that does not come from this codebase.
    const routing = strip(read('lib', 'pushRouting.ts'));
    expect(routing).toMatch(/raw in ROUTES/);
    expect(routing).toMatch(/: '\/explore'/);
    // A tab JUMP. push() or replace() would create a second (tabs) shell —
    // the Phase NAV bug, arriving from a new direction.
    expect(routing).toMatch(/router\.navigate\(route\)/);
    expect(routing).not.toMatch(/router\.(push|replace)\(/);
  });
});
