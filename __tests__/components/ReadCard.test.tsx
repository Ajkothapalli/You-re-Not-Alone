jest.mock('../../components/ConfessionCard', () => ({
  WaveBackground: () => null,
}));

jest.mock('../../components/Persona', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    getPersona: jest.fn(() => ({
      name:   'TestPersona',
      colors: ['#F5996E', '#ffffff', '#000000'],
    })),
    PersonaBadge: () => React.createElement(View, { testID: 'PersonaBadge' }),
  };
});

jest.mock('../../lib/a11y', () => ({
  announce:         jest.fn(),
  useReducedMotion: jest.fn(() => false),
}));

import React from 'react';
import { Animated } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import type { Palette } from '../../theme/palettes';
import ReadCard from '../../components/ReadCard';

const PALETTE: Palette = {
  name:  'test',
  you:   '#F5996E',
  them:  '#FBBF24',
  bands: ['#4C40A4', '#A8407A', '#BD5435'],
};

function mkProps(overrides = {}) {
  return {
    text:        'I never told anyone this.',
    feltCount:   412,
    palette:     PALETTE,
    onReport:    jest.fn(),
    onFelt:      jest.fn(),
    delay:       0,
    personaSeed: 'seed-abc',
    ...overrides,
  };
}

describe('ReadCard — felt interaction', () => {
  it('calls onFelt exactly once on first tap', async () => {
    const onFelt = jest.fn();
    const { getByLabelText } = await render(<ReadCard {...mkProps({ onFelt })} />);
    const feltRow = getByLabelText(/felt this too/i);

    await act(async () => { fireEvent.press(feltRow); });

    expect(onFelt).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onFelt on the second tap (un-felt)', async () => {
    const onFelt = jest.fn();
    const { getByLabelText } = await render(<ReadCard {...mkProps({ onFelt })} />);
    const feltRow = getByLabelText(/felt this too/i);

    await act(async () => { fireEvent.press(feltRow); }); // felt → true
    await act(async () => { fireEvent.press(feltRow); }); // felt → false

    expect(onFelt).toHaveBeenCalledTimes(1);
  });

  it('toggles accessibility selected state on each tap', async () => {
    const { getByLabelText } = await render(<ReadCard {...mkProps()} />);
    const feltRow = getByLabelText(/felt this too/i);

    expect(feltRow.props.accessibilityState.selected).toBe(false);

    await act(async () => { fireEvent.press(feltRow); });
    expect(feltRow.props.accessibilityState.selected).toBe(true);

    await act(async () => { fireEvent.press(feltRow); });
    expect(feltRow.props.accessibilityState.selected).toBe(false);
  });

  it('increments the displayed count by 1 on first tap', async () => {
    const { getByLabelText } = await render(<ReadCard {...mkProps({ feltCount: 100 })} />);
    const feltRow = getByLabelText(/felt this too/i);

    expect(feltRow.props.accessibilityLabel).toMatch(/100/);

    await act(async () => { fireEvent.press(feltRow); });

    expect(feltRow.props.accessibilityLabel).toMatch(/101/);
  });

  it('lub-dub sequence targets 1.0 as its final step (no lingering scale)', async () => {
    const { getByLabelText } = await render(<ReadCard {...mkProps()} />);
    const feltRow = getByLabelText(/felt this too/i);

    // Spy after mount so entrance-animation timing is not counted.
    const timingSpy = jest.spyOn(Animated, 'timing');

    await act(async () => { fireEvent.press(feltRow); });

    // The lub-dub creates 4 timing calls synchronously in handleFelt,
    // before any deferred TickChar work. Their toValues must be the
    // heartbeat pattern ending at 1.0 — no lingering scale.
    const lubDubToValues = timingSpy.mock.calls
      .slice(0, 4)
      .map(([, c]: [any, any]) => c.toValue);

    expect(lubDubToValues).toEqual([1.4, 0.88, 1.2, 1.0]);

    timingSpy.mockRestore();
  });

  it('deflate sequence (un-felt) also returns scale to 1.0', async () => {
    const { getByLabelText } = await render(<ReadCard {...mkProps()} />);
    const feltRow = getByLabelText(/felt this too/i);

    // First tap: felt → true (lub-dub).
    await act(async () => { fireEvent.press(feltRow); });

    // Spy fresh for the second tap only.
    const timingSpy = jest.spyOn(Animated, 'timing');

    // Second tap: felt → false (deflate).
    await act(async () => { fireEvent.press(feltRow); });

    // The deflate creates 2 timing calls synchronously in handleFelt,
    // before any deferred TickChar callbacks. toValues must be [0.65, 1.0].
    const deflateToValues = timingSpy.mock.calls
      .slice(0, 2)
      .map(([, c]: [any, any]) => c.toValue);

    expect(deflateToValues).toEqual([0.65, 1.0]);

    timingSpy.mockRestore();
  });
});
