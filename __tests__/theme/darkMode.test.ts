/**
 * Dark mode has to actually be dark mode.
 *
 * Reported 2026-09-18: illustrations, the splash logo and "some elements" did
 * not adapt to the dark theme — in a build that was already in production.
 * The individual symptoms were scattered, but almost all of them came from two
 * mistakes that a reviewer cannot see by reading one line:
 *
 *   1. theme/tokens.ts exports `color`, a STATIC alias for lightColors, right
 *      next to the dynamic sets. Importing it looks exactly like theming and
 *      is permanently light. app/welcome.tsx did, so the whole FTUE rendered
 *      #1A1A1A text on the #141414 card it also painted — invisible.
 *
 *   2. Illustration scenes draw in PRINT colours that never invert (documented
 *      in theme/illustration.ts). That contract only holds with paper under
 *      them, and IllustrationCard — which exists to supply it — was wired up
 *      in zero of the six render sites.
 *
 * These guard the causes, not the symptoms. A symptom test would pass again
 * the moment someone adds a seventh illustration.
 */

import fs   from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const DIRS = ['app', 'components'];

function sourceFiles(): string[] {
  const walk = (p: string): string[] =>
    fs.readdirSync(p, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(p, e.name);
      if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(full);
      return /\.tsx?$/.test(e.name) ? [full] : [];
    });
  return DIRS.flatMap((d) => walk(path.join(ROOT, d)));
}

describe('nothing imports the static, light-only colour set', () => {
  const files = sourceFiles();

  it('finds files to scan', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  /**
   * `color` imported from theme/tokens is lightColors forever. The dynamic
   * reads are useThemeColors() / useTheme().colors. Importing `radius`,
   * `spacing`, `font`, `fontFamily` or the ColorSet TYPE from tokens is fine —
   * only the colour VALUES are frozen.
   */
  it.each(files.map((f) => [path.relative(ROOT, f), f]))(
    '%s does not import the frozen `color` export',
    (_rel, full) => {
      const src = fs.readFileSync(full as string, 'utf8');
      const imports = src.match(/import\s*\{[^}]*\}\s*from\s*['"](?:@\/|\.\.?\/)*theme\/tokens['"]/g) ?? [];
      for (const imp of imports) {
        const names = imp
          .slice(imp.indexOf('{') + 1, imp.indexOf('}'))
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean);
        // `type ColorSet` is a type-only import and carries no values.
        const bare = names.filter((n) => !n.startsWith('type '));
        expect([path.relative(ROOT, full as string), bare.includes('color')])
          .toEqual([path.relative(ROOT, full as string), false]);
      }
    },
  );
});

describe('every illustration is drawn on paper', () => {
  /**
   * Scene ink is #1A1A1A in both themes by design. On the dark app background
   * (#0A0A0A) or a dark card (#141414) that is invisible, so a scene may only
   * be rendered inside a ground that supplies its paper.
   */
  const SCENES = [
    'Threshold', 'Sanctuary', 'EmptyBench', 'Release',
    'Resonance', 'NotificationsEmpty', 'Lantern',
  ];

  const renderSites = sourceFiles()
    .filter((f) => !f.includes(path.join('components', 'illustrations')))
    .flatMap((f) => {
      const src = fs.readFileSync(f, 'utf8');
      return SCENES
        .filter((s) => new RegExp(`<${s}[\\s/>]`).test(src))
        .map((s) => [path.relative(ROOT, f), s, src] as const);
    });

  it('finds the render sites (guards against a vacuous sweep)', () => {
    expect(renderSites.length).toBeGreaterThanOrEqual(6);
  });

  it.each(renderSites.map(([rel, scene]) => [rel, scene]))(
    '%s renders <%s> inside a paper ground',
    (rel, scene) => {
      const src = fs.readFileSync(path.join(ROOT, rel as string), 'utf8');
      const open = new RegExp(`<${scene}[\\s/>]`);
      const idx  = src.search(open);
      // Look at what encloses it: the nearest preceding open tag must be a
      // ground or a card, not a bare layout View.
      const before = src.slice(0, idx);
      const lastGround = Math.max(
        before.lastIndexOf('<IllustrationGround'),
        before.lastIndexOf('<IllustrationCard'),
      );
      const closedSince = lastGround === -1
        ? true
        : before.slice(lastGround).includes('</IllustrationGround>')
          || before.slice(lastGround).includes('</IllustrationCard>');
      expect([rel, scene, lastGround !== -1 && !closedSince])
        .toEqual([rel, scene, true]);
    },
  );
});

describe('the splash hands off without a colour flash', () => {
  it('AnimatedSplash paints exactly the native splash background', () => {
    const splash = fs.readFileSync(path.join(ROOT, 'components', 'AnimatedSplash.tsx'), 'utf8');
    const app    = require('../../app.json');

    const declared = splash.match(/const NATIVE_SPLASH_BG = '(#[0-9A-Fa-f]{6})'/)?.[1];
    const native   = app.expo.plugins
      .find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen')?.[1]?.backgroundColor;

    expect(declared).toBeDefined();
    expect(declared!.toUpperCase()).toBe(String(native).toUpperCase());
  });

  it('the splash wordmark is not painted with a theme colour', () => {
    // color.paper is #1A1A1A in light mode — near-black type on the near-black
    // splash ground.
    const splash = fs.readFileSync(path.join(ROOT, 'components', 'AnimatedSplash.tsx'), 'utf8');
    const styles = splash.slice(splash.indexOf('wordmarkText:'));
    expect(styles).not.toMatch(/wordmarkText:\s*\{[^}]*color:\s*color\./);
  });
});
