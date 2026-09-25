/**
 * The icon set, and the migration onto it.
 *
 * Two jobs. First: every icon renders in every state and tone — shape data is
 * generated, so a malformed entry would not be caught by the compiler and
 * would surface as a blank square on a device.
 *
 * Second: the things that are easy to half-finish. A back button still flipped
 * with scaleX, a file still importing ScrawlIcon for a functional icon, a tab
 * whose active state never reaches the yellow disc. Those all look fine in a
 * diff and wrong on a phone.
 */

// Forward props so state/tone are observable — the global mock drops them.
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
    Circle: mock('Circle'), Rect: mock('Rect'), Defs: mock('Defs'),
    ClipPath: mock('ClipPath'), LinearGradient: mock('LinearGradient'), Stop: mock('Stop'),
  };
});

import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { render } from '@testing-library/react-native';
import { Icon, ICON_NAMES, type IconState, type IconTone } from '@/components/Icon';

const ROOT = path.join(__dirname, '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function sourceFiles(dir: string): string[] {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sourceFiles(path.join(dir, e.name))
    : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)]
    : [],
  );
}
const APP_SOURCES = [...sourceFiles('app'), ...sourceFiles('components')];

/**
 * The decorative pool's size, pinned.
 *
 * iconAtOffset() indexes ALL_ICON_NAMES by hash MODULO this number, so adding
 * or removing one entry re-rolls the corner decoration on every card in the
 * app. If this assertion fails, that is what happened — it is not a number to
 * update casually.
 */
const POOL_SIZE = 103;

const STATES: IconState[] = ['selected', 'unselected', 'disabled'];
const TONES:  IconTone[]  = ['light', 'dark', 'auto'];

// ─── Every icon, every state, every tone ─────────────────────────────────────

describe('the icon set renders', () => {
  it('has all 29 names', () => {
    expect(ICON_NAMES).toHaveLength(29);
  });

  it.each(ICON_NAMES)('%s renders in all 3 states x 3 tones', async (name) => {
    for (const state of STATES) {
      for (const tone of TONES) {
        const { toJSON } = await render(
          <Icon name={name} state={state} tone={tone} size={24} />,
        );
        // A malformed entry renders an empty wrapper rather than throwing.
        const drawn: string[] = [];
        const walk = (n: any) => {
          if (!n || typeof n !== 'object') return;
          if (Array.isArray(n)) return n.forEach(walk);
          if (typeof n.props?.d === 'string' || n.props?.cx !== undefined) drawn.push('x');
          walk(n.children);
        };
        walk(toJSON());
        expect(drawn.length).toBeGreaterThan(0);
      }
    }
  });

  it('is hidden from screen readers unless given a label', async () => {
    const plain = (await render(<Icon name="book" />)).toJSON() as any;
    expect(plain.props.accessible).toBe(false);

    const labelled = (await render(
      <Icon name="book" accessibilityLabel="Read" />,
    )).toJSON() as any;
    expect(labelled.props.accessibilityLabel).toBe('Read');
  });
});

// ─── ScrawlIcon is decoration only now ───────────────────────────────────────

describe('ScrawlIcon stays decorative', () => {
  it('is imported by exactly the three files that draw texture', () => {
    const importers = APP_SOURCES
      .filter((f) => /from\s+'[^']*ScrawlIcon'/.test(code(read(f))))
      .map((f) => f.replace(/\\/g, '/'))
      .sort();
    expect(importers).toEqual([
      'components/BackgroundPattern.tsx',
      'components/ConfessionCard.tsx',
      'components/ReadCard.tsx',
    ]);
  });

  it('still has its pool untouched — iconAtOffset hashes modulo its size', () => {
    // Adding, removing or reordering an entry re-rolls the decoration on every
    // card in the app, which is why the migration deliberately left it alone.
    // ALL_ICON_NAMES is the pool iconAtOffset indexes into, so assert on it
    // rather than on the source text.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ALL_ICON_NAMES } = require('@/components/ScrawlIcon');
    expect(ALL_ICON_NAMES.length).toBe(POOL_SIZE);
    expect(new Set(ALL_ICON_NAMES).size).toBe(ALL_ICON_NAMES.length);
  });
});

// ─── The half-finish traps ───────────────────────────────────────────────────

describe('the migration is complete', () => {
  it('no back button flips an arrow with scaleX', () => {
    const offenders = APP_SOURCES.filter((f) => /scaleX:\s*-1/.test(code(read(f))));
    expect(offenders).toEqual([]);
  });

  it('MainTabBar is gone and nothing imports it', () => {
    expect(fs.existsSync(path.join(ROOT, 'components', 'MainTabBar.tsx'))).toBe(false);
    const importers = APP_SOURCES.filter((f) => /MainTabBar/.test(code(read(f))));
    expect(importers).toEqual([]);
  });

  it('WriteFAB gives the active tab the light tone on the yellow disc', () => {
    const src = code(read('components', 'WriteFAB.tsx'));
    expect(src).toMatch(/state=\{active \? 'selected' : 'unselected'\}/);
    expect(src).toMatch(/tone=\{active \? 'light' : 'auto'\}/);
    // 'disabled' is greyed-out and means "you cannot press this". An inactive
    // tab is pressable and must stay its own colour, lightened.
    expect(src).not.toContain("'disabled'");
    // The four tabs keep their names.
    for (const n of ['book', 'pencil', 'person', 'bell']) {
      expect(src).toContain(`icon="${n}"`);
    }
  });

  it('notifications render read as unselected and drop the colour map', () => {
    const src = code(read('app', '(tabs)', 'notifications.tsx'));
    expect(src).toMatch(/state=\{isRead \? 'unselected' : 'selected'\}/);
    expect(src).not.toContain('TYPE_ICON_COLOR');
  });

  it('the icons that sit on yellow ask for the light tone', () => {
    // The premium card and the active theme chip are yellow in BOTH themes, so
    // a dark-theme outline would disappear on them.
    const you = code(read('app', '(tabs)', 'you.tsx'));
    expect(you).toMatch(/name="star"[^/]*tone="light"/);
    expect(you).toMatch(/tone=\{active \? 'light' : 'auto'\}/);
  });
});
