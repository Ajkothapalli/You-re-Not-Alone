// Override the global SVG mock to forward props so we can assert on them.
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Svg = (props: any) => {
    const { children, ...rest } = props;
    return React.createElement(View, { testID: 'Svg', ...rest }, children);
  };
  const Path = (props: any) => React.createElement(View, { testID: 'Path', ...props });
  return { __esModule: true, default: Svg, Svg, Path };
});

import React from 'react';
import { render } from '@testing-library/react-native';
import { HeartIcon } from '../../components/HeartIcon';

describe('HeartIcon', () => {
  it('renders exactly one Path', async () => {
    const { getAllByTestId } = await render(<HeartIcon filled={false} color="#F5996E" />);
    expect(getAllByTestId('Path')).toHaveLength(1);
  });

  /**
   * Stroke width is a CONSTANT 2.5 in both states, not 0-when-filled.
   *
   * These two assertions expected 0 and 2 and had been failing since 5fc25e7,
   * which folded HeartIcon into the ScrawlIcon system — whose documented house
   * standard is "48×48 viewBox, 2.5px round stroke" for every icon. The test
   * was written one commit earlier (4613386) and never updated.
   *
   * The component is the correct one here, for a reason the sibling test below
   * already guards: a stroke that vanishes when the heart fills would change
   * the heart's SIZE on every tap. Felt is a toggle people press repeatedly,
   * and it should not wobble. `fill` alone carries the state change.
   */
  it('filled=true: fill=color, stroke stays at the house 2.5', async () => {
    const { getByTestId } = await render(<HeartIcon filled color="#F5996E" size={18} />);
    const path = getByTestId('Path');
    expect(path.props.fill).toBe('#F5996E');
    expect(path.props.strokeWidth).toBe(2.5);
  });

  it('filled=false: fill=none, stroke=color, stroke stays at the house 2.5', async () => {
    const { getByTestId } = await render(<HeartIcon filled={false} color="#F5996E" size={18} />);
    const path = getByTestId('Path');
    expect(path.props.fill).toBe('none');
    expect(path.props.stroke).toBe('#F5996E');
    expect(path.props.strokeWidth).toBe(2.5);
  });

  it('Svg is square: width === height === size', async () => {
    const { getByTestId } = await render(<HeartIcon filled color="#fff" size={22} />);
    const svg = getByTestId('Svg');
    expect(svg.props.width).toBe(22);
    expect(svg.props.height).toBe(22);
  });

  it('defaults to size=18 when size is omitted', async () => {
    const { getByTestId } = await render(<HeartIcon filled={false} color="#000" />);
    const svg = getByTestId('Svg');
    expect(svg.props.width).toBe(18);
    expect(svg.props.height).toBe(18);
  });

  it('outline and filled share the same path data (no geometry jump on toggle)', async () => {
    const { getByTestId: getOutline } = await render(<HeartIcon filled={false} color="#F00" size={18} />);
    const { getByTestId: getFilled  } = await render(<HeartIcon filled color="#F00" size={18} />);
    expect(getOutline('Path').props.d).toBe(getFilled('Path').props.d);
  });
});
