/**
 * The logo, as vector.
 *
 * The logo is drawn by components/brand/SoulyapLogo rather than shipped as a
 * PNG. Three things about that are easy to get wrong and invisible when you do:
 *
 *   1. SVG ids are DOCUMENT-global. Two logos on one screen (onboarding shows
 *      a small one while the splash overlay is still mounted) sharing ClipPath
 *      or LinearGradient ids means one silently adopts the other's geometry.
 *      React's useId is what prevents it; this asserts the result, not the
 *      mechanism.
 *   2. The mark is ~3:1. Every box that holds it must match LOGO_ASPECT — a
 *      square box renders it a sliver, which is exactly what shipped before.
 *   3. The two halves must keep the 0.4111 split of the PNGs they replaced,
 *      or the splash seam moves and the native → JS handoff jumps.
 */

// The global react-native-svg mock (jest.setup.js) renders bare Views and
// DROPS every prop, so id / clipPath / fill are invisible through it — the id
// assertions below would pass on an empty tree. This file-local mock forwards
// props so those assertions actually look at something.
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const mock = (name: string) => {
    const C = ({ children, testID, ...rest }: any) =>
      React.createElement(View, { testID: testID ?? name, ...rest }, children);
    C.displayName = name;
    return C;
  };
  return {
    __esModule: true,
    default: mock('Svg'), Svg: mock('Svg'), G: mock('G'), Path: mock('Path'),
    Rect: mock('Rect'), Defs: mock('Defs'), ClipPath: mock('ClipPath'),
    LinearGradient: mock('LinearGradient'), Stop: mock('Stop'),
  };
});

import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { render } from '@testing-library/react-native';
import {
  LogoMark, QuoteLeft, QuoteRight, LOGO_ASPECT, QUOTE_LEFT_RATIO,
} from '@/components/brand/SoulyapLogo';

const ROOT = path.join(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

/** Strip comments so a guard is never satisfied — or tripped — by prose. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function sourceFiles(dir: string): string[] {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sourceFiles(path.join(dir, e.name))
    : /\.(tsx?|jsx?)$/.test(e.name) ? [path.join(dir, e.name)]
    : [],
  );
}
const APP_SOURCES = [...sourceFiles('app'), ...sourceFiles('components')];

// ─── It renders at all ───────────────────────────────────────────────────────

describe('the logo components render', () => {
  it.each([
    ['LogoMark',   LogoMark],
    ['QuoteLeft',  QuoteLeft],
    ['QuoteRight', QuoteRight],
  ])('%s renders one Svg without crashing', async (_n, C) => {
    const { getAllByTestId } = await render(React.createElement(C));
    expect(getAllByTestId('Svg')).toHaveLength(1);
  });
});

// ─── Two instances must not share ids ────────────────────────────────────────

describe('two logos on one screen keep their own ids', () => {
  /** Every id="..." and every url(#...) reference in the rendered tree. */
  function idsOf(tree: unknown): { defined: string[]; referenced: string[] } {
    const defined: string[] = [];
    const referenced: string[] = [];
    const walk = (n: any) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) return n.forEach(walk);
      const p = n.props ?? {};
      if (typeof p.id === 'string') defined.push(p.id);
      for (const v of Object.values(p)) {
        if (typeof v === 'string') {
          const m = v.match(/^url\(#(.+)\)$/);
          if (m) referenced.push(m[1]);
        }
      }
      walk(n.children);
    };
    walk(tree);
    return { defined, referenced };
  }

  it('defines every ClipPath / LinearGradient id exactly once across two marks', async () => {
    const { toJSON } = await render(
      React.createElement(React.Fragment, null,
        React.createElement(LogoMark, { key: 'a' }),
        React.createElement(LogoMark, { key: 'b' })),
    );
    const { defined } = idsOf(toJSON());

    // Both instances rendered (4 glyphs each => a gradient + a clip per glyph).
    expect(defined.length).toBeGreaterThan(0);
    expect(new Set(defined).size).toBe(defined.length);
  });

  it('every url(#id) resolves to an id defined in the same tree', async () => {
    const { toJSON } = await render(
      React.createElement(React.Fragment, null,
        React.createElement(LogoMark, { key: 'a' }),
        React.createElement(QuoteLeft, { key: 'b' })),
    );
    const { defined, referenced } = idsOf(toJSON());
    expect(referenced.length).toBeGreaterThan(0);
    expect(referenced.filter((r) => !defined.includes(r))).toEqual([]);
  });
});

// ─── The PNGs are gone and nothing looks for them ────────────────────────────

describe('the retired PNGs', () => {
  const RETIRED = ['splash-quote-left.png', 'splash-quote-right.png', 'splash-icon.png'];

  it.each(RETIRED)('%s is referenced by no file in app/ or components/', (png) => {
    // Matched as a module reference, not a bare string: SoulyapLogo's header
    // names these files to explain where its frames came from, and a naive
    // substring search would fail on that explanation.
    const re = new RegExp(`require\\([^)]*${png.replace('.', '\\.')}`);
    expect(APP_SOURCES.filter((f) => re.test(code(read(f))))).toEqual([]);
  });

  it.each(RETIRED)('%s is gone from assets/', (png) => {
    expect(fs.existsSync(path.join(ROOT, 'assets', png))).toBe(false);
  });

  it('is named by no app.json / eas.json path', () => {
    for (const f of ['app.json', 'eas.json']) {
      if (fs.existsSync(path.join(ROOT, f))) {
        expect(read(f)).not.toMatch(/splash-quote|splash-icon/);
      }
    }
  });
});

// ─── Boxes match the mark's shape ────────────────────────────────────────────

describe('every box holding the full mark matches its aspect', () => {
  function styleBox(src: string, name: string) {
    const body = code(src).match(new RegExp(`${name}:\\s*\\{([^}]*)\\}`))?.[1];
    if (!body) throw new Error(`style "${name}" not found`);
    // Accepts a literal or an expression like `12 * LOGO_ASPECT`.
    const num = (k: string) => {
      const raw = body.match(new RegExp(`${k}:\\s*([^,\\n]+)`))?.[1]?.trim();
      if (!raw) throw new Error(`"${name}" has no ${k}`);
      return Function('LOGO_ASPECT', `return (${raw});`)(LOGO_ASPECT) as number;
    };
    return { width: num('width'), height: num('height') };
  }

  it.each([
    ['rtue welcome-back', path.join('app', 'rtue.tsx'),             'logo'],
    ['share-card lockup', path.join('components', 'StoryCard.tsx'), 'brandIcon'],
  ])('%s', (_label, file, style) => {
    expect(code(read(file))).toMatch(/<LogoMark\b/);
    const { width, height } = styleBox(read(file), style);
    expect(width / height).toBeCloseTo(LOGO_ASPECT, 1);
    // A square box is ~2 off — a loose tolerance would wave the old bug through.
    expect(Math.abs(width / height - LOGO_ASPECT)).toBeLessThanOrEqual(0.1);
  });
});

// ─── The splash seam ─────────────────────────────────────────────────────────

describe('the two halves still split where the PNGs did', () => {
  const SPLIT = 0.4111;

  it('QUOTE_LEFT_RATIO is the ratio the layouts hard-code', () => {
    expect(QUOTE_LEFT_RATIO).toBeCloseTo(SPLIT, 4);
    expect(QUOTE_LEFT_RATIO).toBeCloseTo(421 / 1024, 10);
  });

  it.each([
    ['app/welcome.tsx',               /const LEFT_R\s*=\s*([\d.]+)/],
    ['components/AnimatedSplash.tsx', /const LEFT_RATIO\s*=\s*([\d.]+)/],
  ])('%s still splits at 0.4111', (file, re) => {
    expect(Number(code(read(file)).match(re)![1])).toBe(SPLIT);
  });

  it.each(['app/auth.tsx', 'app/index.tsx'])('%s still splits at 0.4111', (file) => {
    const src = code(read(file));
    expect(src).toContain('0.4111');
    expect(src).toContain('1 - 0.4111');
  });

  // The halves are drop-ins only while they keep the retired PNGs' frames AND
  // stretch to fill, which is what <Image resizeMode="stretch"> did. A "meet"
  // here would letterbox each half inside its box and open a gap at the seam.
  it('the halves keep the old PNG frames and stretch to fill', () => {
    const src = code(read('components', 'brand', 'SoulyapLogo.tsx'));
    expect(src).toMatch(/QuoteLeft\s*=\s*makeLogo\('0 0 421 1024',\s*'none'/);
    expect(src).toMatch(/QuoteRight\s*=\s*makeLogo\('421 0 603 1024',\s*'none'/);
  });
});

// ─── Platform PNGs still present ─────────────────────────────────────────────

describe('platform-required PNGs are still shipped', () => {
  function pngSize(file: string) {
    const buf = fs.readFileSync(path.join(ROOT, 'assets', file));
    expect(buf.subarray(12, 16).toString('ascii')).toBe('IHDR');
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  it.each([
    ['icon.png',                    1024, 1024],
    ['android-icon-foreground.png', 1024, 1024],
    ['android-icon-monochrome.png', 1024, 1024],
    ['playstore-icon.png',           512,  512],
    ['favicon.png',                   48,   48],
  ])('%s is %i×%i', (file, width, height) => {
    expect(pngSize(file as string)).toEqual({ width, height });
  });

  it('app.json still points at those filenames', () => {
    const cfg = read('app.json');
    for (const f of [
      'icon.png', 'android-icon-foreground.png',
      'android-icon-monochrome.png', 'favicon.png',
    ]) expect(cfg).toContain(`./assets/${f}`);
  });
});
