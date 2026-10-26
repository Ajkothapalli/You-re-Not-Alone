/**
 * [NAV] There is ONE tab set, and the tabs are reached by switching, not by
 * pushing.
 *
 * The bug these guard against did not look like a navigation bug. Read lived
 * in the ROOT stack while Write/You/Alerts lived in (tabs), and the bar called
 * router.navigate() across that boundary. In expo-router 56's vendored
 * StackRouter, NAVIGATE reuses a route only when getId matches, when the name
 * equals the CURRENT route, or when payload.pop is set — otherwise it PUSHES a
 * route with a fresh key. So Read→Write pushed a whole new (tabs) navigator,
 * Write→Read pushed a whole new explore, and the stack grew
 * [explore, (tabs), explore, (tabs), …].
 *
 * What the user saw was screens rebuilding on every visit, scroll position
 * lost, and Android back walking a pile of copies. Nothing errored. Nothing
 * failed a test. That is why these are source-level and why they are blunt:
 * the regression is silent, and the only reliable signal is the file layout
 * and the verbs at the call sites.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')
   .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');

/** Every .ts/.tsx under a directory. */
function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

const TABS = ['explore', 'write', 'you', 'notifications'] as const;

describe('the four tabs live in exactly one navigator', () => {
  it.each(TABS)('app/(tabs)/%s.tsx exists', (name) => {
    expect(fs.existsSync(path.join(ROOT, 'app', '(tabs)', `${name}.tsx`))).toBe(true);
  });

  it.each(TABS)('there is no root-stack copy of %s', (name) => {
    // A second file is a second mountable screen, and expo-router will happily
    // route to it. Two copies of Write means two drafts, two mic states, and
    // a feature added to one of them silently missing from the other — which
    // is what happened to dictation within a day of it landing.
    expect(fs.existsSync(path.join(ROOT, 'app', `${name}.tsx`))).toBe(false);
  });

  it('the root stack declares none of them as its own screens', () => {
    const layout = strip(read('app', '_layout.tsx'));
    for (const name of TABS) {
      expect(layout).not.toMatch(new RegExp(`Stack\\.Screen\\s+name="${name}"`));
    }
    expect(layout).toMatch(/Stack\.Screen\s+name="\(tabs\)"/);
  });

  it('the tab navigator declares all four, and nothing else', () => {
    const layout = strip(read('app', '(tabs)', '_layout.tsx'));
    const declared = [...layout.matchAll(/Tabs\.Screen\s+name="([^"]+)"/g)].map((m) => m[1]);
    expect(declared.sort()).toEqual([...TABS].sort());
  });
});

describe('switching tabs is a jump, never a push', () => {
  /**
   * push() and replace() both create a NEW route entry. Against a tab target
   * that is the copy-making bug above. navigate() reuses the existing tab;
   * dismissTo() pops back to it from a screen stacked on top.
   */
  const FILES = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components'))];
  const TARGET = /(['"])\/(explore|write|you|notifications)\1|pathname:\s*(['"])\/(explore|write|you|notifications)\3/;

  it('no file pushes or replaces a tab route', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const src = strip(fs.readFileSync(file, 'utf8'));
      // router.push('/write') / router.push({ pathname: '/write', … })
      const calls = src.match(/router\.(push|replace)\((?:[^()]|\([^()]*\))*\)/g) ?? [];
      for (const call of calls) {
        if (TARGET.test(call)) offenders.push(`${path.relative(ROOT, file)}: ${call.slice(0, 80)}`);
      }
    }
    // app/index.tsx is the one legitimate replace: it swaps the root index
    // route itself for (tabs) at boot, which is a replacement of the entry
    // point, not a tab switch. Everything else is a bug.
    const unexpected = offenders.filter((o) => !o.startsWith('app/index.tsx'));
    expect(unexpected).toEqual([]);
  });

  it('the bar reads the active tab from navigation state, not from the path', () => {
    // usePathname only updates once a navigation has COMPLETED, so the
    // indicator lagged the tap by a frame or more and needed an optimistic
    // TTL cache to hide it. As the navigator's own tabBar it gets state.index,
    // which changes in the same commit as the tap.
    const bar = strip(read('components', 'WriteFAB.tsx'));
    expect(bar).toMatch(/state\.index/);
    expect(bar).not.toMatch(/usePathname/);
    expect(bar).not.toMatch(/tabNav/);
  });

  it('the bar is mounted BY the navigator, so it cannot outlive it', () => {
    const layout = strip(read('app', '(tabs)', '_layout.tsx'));
    expect(layout).toMatch(/tabBar=\{/);
    // Rendered a second time in the root layout, it would sit over pushed
    // screens with no way to know it should not be there.
    expect(strip(read('app', '_layout.tsx'))).not.toMatch(/<WriteFAB/);
  });
});

describe('the tabs stay mounted', () => {
  const layout = strip(read('app', '(tabs)', '_layout.tsx'));

  it('hidden tabs are frozen rather than unmounted', () => {
    // freezeOnBlur stops a hidden tab re-rendering; it does NOT unmount it.
    // unmountOnBlur would bring back the exact remount cost this phase removed.
    expect(layout).toMatch(/freezeOnBlur:\s*true/);
    expect(layout).not.toMatch(/unmountOnBlur/);
  });

  it('Read is the landing tab and back leaves from there', () => {
    expect(layout).toMatch(/initialRouteName="explore"/);
    expect(layout).toMatch(/backBehavior="firstRoute"/);
  });
});

describe('a second copy of (tabs) is caught at runtime, in dev', () => {
  it('the root layout still carries the guard', () => {
    // Source-level guards only see the call sites that exist today. The dev
    // guard sees the actual route stack, which is the thing that was wrong.
    const layout = read('app', '_layout.tsx');
    expect(layout).toMatch(/useRootNavigationState/);
    expect(strip(layout)).toMatch(/__DEV__/);
    expect(strip(layout)).toMatch(/console\.error/);
  });
});

describe('the first visit to a tab does not pay for building it', () => {
  const layout = strip(read('app', '(tabs)', '_layout.tsx'));
  const bar    = strip(read('components', 'WriteFAB.tsx'));

  /**
   * NAV stopped tabs REMOUNTING. It could not stop the FIRST mount, which
   * `lazy` defers into the frame that is meant to be showing the screen —
   * and on a device that was still a visible jerk.
   */
  it('the tab bar preloads the others', () => {
    // Source-level because the alternative is asserting on a frame budget,
    // which no test here can see. If this import goes, the stutter is back
    // and nothing else fails.
    expect(bar).toMatch(/useTabPreload/);
    expect(bar).toMatch(/useTabPreload\(navigation, state\.routeNames, activeIndex\)/);
  });

  it('and does it through the navigation object, not an internal import', () => {
    // CommonActions lives under expo-router/build/react-navigation/, which
    // that source marks internal. Nothing needs it: every action creator is
    // spread onto the navigation object the navigator hands its own tabBar.
    const hook = strip(read('hooks', 'useTabPreload.ts'));
    expect(hook).not.toMatch(/from\s+'expo-router\/build/);
    expect(hook).toMatch(/navigation\.preload/);
    // Optional + runtime-checked, because it reaches us structurally.
    expect(hook).toMatch(/typeof navigation\.preload !== 'function'/);
  });

  it('lazy:false is still NOT the fix', () => {
    // It mounts all four before Read paints — the cost moved to cold start
    // rather than removed.
    expect(layout).not.toMatch(/lazy:\s*false/);
  });

  it('preloading never fires a focus effect', () => {
    /**
     * The one that would do real harm. Alerts marks notifications READ in
     * its focus effect; a preload that focused it would clear somebody's
     * unread badge for a screen they never opened.
     *
     * PRELOAD leaves state.index alone in the vendored TabRouter, so focus
     * never fires — asserted here against the installed router so an
     * upgrade that changes it fails loudly rather than silently eating
     * unread counts.
     */
    const tabRouter = fs.readFileSync(
      path.join(ROOT, 'node_modules', 'expo-router', 'build',
                'react-navigation', 'routers', 'TabRouter.js'), 'utf8');
    const start = tabRouter.indexOf("case 'PRELOAD':");
    expect(start).toBeGreaterThan(-1);
    const block = tabRouter.slice(start, tabRouter.indexOf('default:', start));
    expect(block).not.toMatch(/index:/);
  });
});
