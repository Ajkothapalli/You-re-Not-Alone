/**
 * CategoryBadge — the seven category chips.
 *
 * CategoryGlyph (the large standalone drawing) is gone: nothing imported it,
 * and the gradient shapes it drew now live in the generated icon set. The
 * old tests here checked gradient-id uniqueness, which was a property of the
 * module-level counter that went with it.
 *
 * What is worth pinning now is the mapping: every CategoryId must resolve to
 * a real icon. A category added without one would render nothing at all, and
 * an empty chip is the kind of thing that ships unnoticed.
 */

// Forward props so shape data is observable — the global mock drops them.
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
import { CategoryBadge } from '@/components/CategoryGlyph';
import { ICON_NAMES } from '@/components/Icon';
import { CATEGORY_IDS } from '@/lib/categories';
import type { CategoryId } from '@/lib/categories';

/** Every `d` in the tree — two categories must not draw the same shape. */
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

describe('CategoryBadge', () => {
  it.each([...CATEGORY_IDS])('renders %s without crashing', async (id) => {
    await render(<CategoryBadge id={id as CategoryId} />);
  });

  it('has an icon for every category, with none left over', () => {
    // The map is spelled out rather than built from a template literal, so
    // this is what catches a category added without an icon.
    for (const id of CATEGORY_IDS) {
      expect(ICON_NAMES).toContain(`cat_${id}`);
    }
    const catIcons = ICON_NAMES.filter((n) => n.startsWith('cat_'));
    expect(catIcons).toHaveLength(CATEGORY_IDS.length);
  });

  it('draws a different icon for each category', async () => {
    // A map that collapsed two ids onto one icon would still render, look
    // plausible, and be wrong.
    const shapes = new Set<string>();
    for (const id of CATEGORY_IDS) {
      const { toJSON } = await render(<CategoryBadge id={id as CategoryId} size={24} />);
      shapes.add(paths(toJSON()).join('|'));
    }
    expect(shapes.size).toBe(CATEGORY_IDS.length);
  });

  it('defaults to size 50 and honours an explicit size', async () => {
    for (const [props, expected] of [
      [{}, 50],
      [{ size: 22 }, 22],
    ] as const) {
      const { toJSON } = await render(
        <CategoryBadge id="relationships" {...props} />,
      );
      const root = toJSON() as any;
      const style = (Array.isArray(root.props.style) ? root.props.style : [root.props.style])
        .find((s: any) => s && typeof s.width === 'number');
      expect(style).toMatchObject({ width: expected, height: expected });
    }
  });

  it('no longer carries its own colour table', async () => {
    // The accent is the icon's own now. A PAL table here would fight it.
    const raw = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'components', 'CategoryGlyph.tsx'), 'utf8',
    );
    // Comments stripped first: the header explains that the PAL table was
    // REMOVED, and an unstripped search matches its own explanation. This
    // file has fallen for that before.
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/#[0-9A-Fa-f]{6}/);
    expect(code).not.toMatch(/\bPAL\b/);
  });
});
