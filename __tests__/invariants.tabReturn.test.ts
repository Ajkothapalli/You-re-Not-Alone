/**
 * [NAV §4/§5] Returning to a tab shows what was there.
 *
 * Source-level, because the failure is a FLICKER: a spinner for 200ms over
 * content the app already had, an illustration appearing a frame late, a
 * keyboard left standing over the feed. None of it throws, none of it fails
 * a render test, and all of it is what made the app feel like it was
 * rebuilding itself — which is the complaint this phase exists to answer.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT  = path.join(__dirname, '..');
const read  = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
/** Guards constrain CODE. A file explaining why it does NOT do something
 *  would otherwise fail the guard against doing it — four times so far. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

const alerts  = strip(read('app', '(tabs)', 'notifications.tsx'));
const you     = strip(read('app', '(tabs)', 'you.tsx'));
const write   = strip(read('app', '(tabs)', 'write.tsx'));
const explore = strip(read('app', '(tabs)', 'explore.tsx'));

describe('Alerts does not blank itself to refresh', () => {
  it('has no setLoading(true) in its focus effect', () => {
    // This was the bug exactly: every focus swapped the list for a spinner,
    // including the overwhelmingly common case where the refresh returned
    // the same list it replaced.
    expect(alerts).not.toMatch(/setLoading\(true\)/);
  });

  it('spins only when nothing has ever loaded', () => {
    // null is "not known yet"; an empty ARRAY is a real answer with its own
    // designed screen. Conflating them re-shows a spinner to arrive at the
    // same emptiness.
    expect(alerts).toMatch(/notifications === null/);
    expect(alerts).toMatch(/AppNotification\[\] \| null/);
  });

  it('seeds from the cache and writes back to it', () => {
    expect(alerts).toMatch(/readTabMemory<AppNotification\[\]>\(TAB_MEMORY\.alerts\)/);
    expect(alerts).toMatch(/writeTabMemory\(TAB_MEMORY\.alerts, data\)/);
  });

  it('still marks read on focus, and only when there is something unread', () => {
    // §4 said this behaviour stays exactly as it is. It is the one thing on
    // this screen with a side effect the reader cannot undo.
    expect(alerts).toMatch(/unreadCount > 0/);
    expect(alerts).toMatch(/markNotificationsRead\(\)/);
  });

  it('a failed refresh keeps what is on screen', () => {
    // setNotifications is called on the success path only. A catch that
    // cleared the list would take away alerts someone is reading because a
    // background request timed out.
    const c = alerts.slice(alerts.indexOf('useFocusEffect'));
    const body = c.slice(0, c.indexOf('}, []));'));
    const inCatch = body.slice(body.indexOf('} catch'));
    expect(inCatch).not.toMatch(/setNotifications/);
  });
});

describe('You does not blank itself either', () => {
  it('spins only on a first load', () => {
    expect(you).toMatch(/if \(firstLoad\) setConfessionsLoading\(true\)/);
    expect(you).toMatch(/const firstLoad = confessionsRef\.current\.length === 0/);
  });

  it('reads the count through a ref, not through a stale closure', () => {
    // loadConfessions runs from a focus effect with empty deps, so a direct
    // read of `confessions` is frozen at the first render — firstLoad would
    // be true forever and the spinner would come back on every focus.
    expect(you).toMatch(/confessionsRef\.current = confessions/);
  });

  it('a failed background refresh does not replace the summary with an error', () => {
    expect(you).toMatch(/if \(firstLoad\) setConfessionsError/);
  });

  it('seeds from the cache and writes back to it', () => {
    expect(you).toMatch(/readTabMemory<OwnConfession\[\]>\(TAB_MEMORY\.myConfessions\)/);
    expect(you).toMatch(/writeTabMemory\(TAB_MEMORY\.myConfessions, data\)/);
  });
});

describe('the caches do not outlive the account', () => {
  it.each([
    ['app/(tabs)/you.tsx',  you],
    ['app/settings.tsx',    strip(read('app', 'settings.tsx'))],
  ])('%s clears them on sign-out', (_name, src) => {
    const fn = src.slice(src.indexOf('async function handleSignOut'));
    expect(fn.slice(0, 600)).toMatch(/clearTabMemory\(\)/);
  });

  it('account deletion clears them too', () => {
    // The content has just been erased server-side; a cache still holding it
    // would outlive the erasure it was promised.
    const blk = you.slice(you.indexOf('await deleteAccount(mode)'));
    expect(blk.slice(0, 400)).toMatch(/clearTabMemory\(\)/);
  });
});

describe('the illustrations do not pop in a frame late', () => {
  it.each([
    ['Alerts', alerts],
    ['You',    you],
  ])('%s seeds the measured width instead of starting at zero', (_n, src) => {
    expect(src).toMatch(/useAspectFitWidth\(4 \/ 3, Dimensions\.get\('window'\)\.width - \d+\)/);
  });

  it('a zero-width layout pass cannot un-seed the box', () => {
    const hook = strip(read('hooks', 'useAspectFit.ts'));
    const fn   = hook.slice(hook.indexOf('export function useAspectFitWidth'));
    expect(fn).toMatch(/if \(availWidth <= 0\) return;/);
  });
});

describe('the keyboard does not follow you out of Write', () => {
  it('is dismissed when the tab loses focus', () => {
    // The screen stays mounted now, so the field keeps its focus and the
    // keyboard stayed up over the feed — half the reading surface covered by
    // a keyboard belonging to a screen that is no longer visible.
    expect(write).toMatch(/useFocusEffect\(useCallback\(\(\) => \(\) => \{ Keyboard\.dismiss\(\); \}, \[\]\)\)/);
  });

  it('and the draft is not touched on the way out', () => {
    const fx = write.slice(write.indexOf('Keyboard.dismiss'));
    expect(fx.slice(0, 120)).not.toMatch(/clearDraft|setDraft/);
  });
});

describe('the Read tab does no work on a plain return', () => {
  it('does not re-randomise the card icons on focus', () => {
    // A changed iconSessionOffset is a changed prop on every card, so this
    // re-rendered the whole feed — and visibly redrew every icon — each time
    // the reader came back.
    expect(explore).not.toMatch(/setIconSession\(/);
  });

  it('still stops playback on blur', () => {
    // The focus effect was not deleted, only the randomising line inside it.
    expect(explore).toMatch(/return \(\) => stopAllPlayback\(\)/);
  });

  it('fetches the weekly question once, not twice', () => {
    // fetchRecommendations already loads it in parallel with the feed; a
    // second mount effect meant two identical round trips racing to set the
    // same state on every cold start.
    expect(explore.match(/getCurrentQuestion\(\)/g) ?? []).toHaveLength(1);
  });

  it('refreshes quietly, and only when the batch is genuinely old', () => {
    expect(explore).toMatch(/QUIET_REFRESH_MS/);
    expect(explore).toMatch(/fetchRecommendations\(\{ background: true \}\)/);
    // Ten minutes, not ten seconds. Anything that made this feel continuous
    // would cross the line CLAUDE.md #2 draws around automatic refilling.
    const raw = read('app', '(tabs)', 'explore.tsx');
    expect(raw).toMatch(/QUIET_REFRESH_MS = 10 \* 60 \* 1000/);
  });

  it('has no refresh gesture and nothing that loads on scroll', () => {
    // CLAUDE.md #2. The quiet refresh REPLACES a batch; it must never grow
    // the feed, and "Keep reading" stays the one explicit tap that does.
    expect(explore).not.toMatch(/RefreshControl|onRefresh|onEndReached/);
  });
});
