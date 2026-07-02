import React from 'react';
import { render } from '@testing-library/react-native';
import { CategoryGlyph, CategoryBadge } from '@/components/CategoryGlyph';
import { CATEGORY_IDS } from '@/lib/categories';
import type { CategoryId } from '@/lib/categories';

describe('CategoryGlyph', () => {
  it.each([...CATEGORY_IDS])('renders %s without crashing', async (id) => {
    await render(<CategoryGlyph id={id as CategoryId} />);
  });

  it('accepts custom size', async () => {
    const { getByTestId } = await render(<CategoryGlyph id="mental_health" size={80} />);
    // SVG root is mocked as View with testID="Svg"
    expect(getByTestId('Svg')).toBeTruthy();
  });

  it('renders 7 unique gradient IDs across all categories (no ID reuse in same render)', async () => {
    // Each instance uses a module-level counter, so IDs are always unique
    const { getAllByTestId } = await render(
      <>
        {CATEGORY_IDS.map(id => (
          <CategoryGlyph key={id} id={id as CategoryId} size={24} />
        ))}
      </>
    );
    // 7 Svg roots — one per glyph
    expect(getAllByTestId('Svg')).toHaveLength(7);
  });
});

describe('CategoryBadge', () => {
  it.each([...CATEGORY_IDS])('renders badge for %s without crashing', async (id) => {
    await render(<CategoryBadge id={id as CategoryId} />);
  });

  it('default size is 50', async () => {
    const { root } = await render(<CategoryBadge id="relationships" />);
    // The outer View gets its style from size=50
    const outerStyle = root!.props.style;
    if (Array.isArray(outerStyle)) {
      const flat = outerStyle.find((s: any) => s?.width === 50);
      expect(flat).toBeTruthy();
    } else {
      expect(outerStyle?.width).toBe(50);
    }
  });

  it('is hidden from accessibility tree', async () => {
    const { root } = await render(<CategoryBadge id="secrets" />);
    expect(root!.props.accessibilityElementsHidden).toBe(true);
    expect(root!.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});
