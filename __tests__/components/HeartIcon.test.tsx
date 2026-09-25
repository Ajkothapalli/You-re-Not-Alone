/**
 * HeartIcon — the felt toggle's heart.
 *
 * It is now a thin wrapper over the generated icon set, so there is nothing
 * left here to assert about paths, fills or stroke widths: that shape data is
 * generated from the design source and deliberately not hand-edited. What
 * still matters, and what this file pins, is the mapping — filled picks the
 * solid heart, empty picks the outline — plus the fact that the `color` prop
 * is gone, since a caller-supplied tint would fight the icon's own accent.
 *
 * The previous version of this file asserted strokeWidth 0/2 and had been
 * failing silently since 5fc25e7 folded HeartIcon into the ScrawlIcon system.
 * Testing a generated component's internals is how that happens.
 */

// Forward props so the icon name is observable — the global mock drops them.
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

import React from 'react';
import { render } from '@testing-library/react-native';
import { HeartIcon } from '../../components/HeartIcon';
import { ICON_NAMES } from '../../components/Icon';

/** Collect every `d` in the rendered tree — the two hearts differ by shape. */
function paths(tree: unknown): string[] {
  const out: string[] = [];
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n.props?.d === 'string') out.push(n.props.d);
    walk(n.children);
  };
  walk(tree);
  return out;
}

describe('HeartIcon', () => {
  it('renders without crashing in both states', async () => {
    for (const filled of [true, false]) {
      const { getAllByTestId } = await render(<HeartIcon filled={filled} />);
      // includeHiddenElements: the icon sets accessibilityElementsHidden, and
      // RTL leaves hidden subtrees out of queries by default.
      expect(getAllByTestId('Svg', { includeHiddenElements: true })).toHaveLength(1);
    }
  });

  it('draws a different heart filled than empty', async () => {
    // The mapping is the whole job of this component. If both states resolved
    // to the same icon the toggle would look broken and nothing else here
    // would catch it.
    const solid = paths((await render(<HeartIcon filled />)).toJSON());
    const empty = paths((await render(<HeartIcon filled={false} />)).toJSON());
    expect(solid.length).toBeGreaterThan(0);
    expect(empty.length).toBeGreaterThan(0);
    expect(solid.join('|')).not.toBe(empty.join('|'));
  });

  it('uses names that exist in the icon set', () => {
    // A typo would be caught by the compiler, but only while both names stay
    // in ICON_NAMES — this fails loudly if either is ever dropped.
    expect(ICON_NAMES).toContain('heart');
    expect(ICON_NAMES).toContain('heart_empty');
  });

  it('passes its size through to the box', async () => {
    const { toJSON } = await render(<HeartIcon filled size={42} />);
    const root = toJSON() as any;
    const style = (Array.isArray(root.props.style) ? root.props.style : [root.props.style])
      .find((x: any) => x && typeof x.width === 'number');
    expect(style).toMatchObject({ width: 42, height: 42 });
  });

  it('no longer accepts a color prop', () => {
    // Removed on purpose: the heart carries its own pink accent, and a
    // caller-supplied tint would override it — the same mistake the old
    // per-type colour map in notifications was making.
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'components', 'HeartIcon.tsx'), 'utf8',
    );
    expect(src).not.toMatch(/\bcolor\s*[:,]/);
  });
});
