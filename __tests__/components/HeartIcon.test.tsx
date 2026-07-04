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

  it('filled=true: fill=color, strokeWidth=0', async () => {
    const { getByTestId } = await render(<HeartIcon filled color="#F5996E" size={18} />);
    const path = getByTestId('Path');
    expect(path.props.fill).toBe('#F5996E');
    expect(path.props.strokeWidth).toBe(0);
  });

  it('filled=false: fill=none, stroke=color, strokeWidth=2', async () => {
    const { getByTestId } = await render(<HeartIcon filled={false} color="#F5996E" size={18} />);
    const path = getByTestId('Path');
    expect(path.props.fill).toBe('none');
    expect(path.props.stroke).toBe('#F5996E');
    expect(path.props.strokeWidth).toBe(2);
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
