/**
 * ReadCard's memo, and the thing that makes it real.
 *
 * A memo is only worth anything if the parent passes stable props. The feed
 * used to build three inline arrows per card per render, so every parent
 * render changed every card's props and the memo — had it existed — would
 * have done nothing. These tests pin BOTH halves: the component skips a
 * render on unchanged props, and it does NOT skip when a caller passes a
 * fresh closure, which is exactly how this silently stops working.
 */

jest.mock('@/lib/analytics', () => ({ analytics: new Proxy({}, { get: () => jest.fn() }) }));
jest.mock('@/lib/a11y', () => ({ useReducedMotion: () => true, announce: jest.fn() }));
jest.mock('@/lib/audioPlayback', () => ({
  useAudioPlayback: () => ({ playing: false, toggle: jest.fn(), durationMs: 0 }),
  stopAllPlayback:  jest.fn(),
}));

import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import ReadCard from '@/components/ReadCard';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/palettes';

/**
 * Counted via getPersona, which ReadCard calls during its own render.
 *
 * NOT via PersonaBadge: that component is memoized too, so it would skip a
 * render even when ReadCard did re-render — the probe would have reported
 * success regardless of whether the memo worked.
 */
const mockRenders = { n: 0 };
jest.mock('@/components/Persona', () => {
  const actual = jest.requireActual('@/components/Persona');
  return {
    ...actual,
    getPersona: (...a: unknown[]) => {
      mockRenders.n++;
      return actual.getPersona(...a);
    },
  };
});

const STABLE_REPORT = () => {};
const STABLE_FELT   = () => {};
const STABLE_PRESS  = () => {};

function Harness({ stable }: { stable: boolean }) {
  const [, setTick] = useState(0);
  return (
    <ThemeProvider>
      <Pressable testID="rerender" onPress={() => setTick((t) => t + 1)}>
        <Text>bump</Text>
      </Pressable>
      <ReadCard
        text="i never told anyone about that night"
        feltCount={12}
        confessionId="abc"
        personaSeed="abc"
        palette={palettes[0]}
        onReport={stable ? STABLE_REPORT : () => {}}
        onFelt={stable ? STABLE_FELT : () => {}}
        onPress={stable ? STABLE_PRESS : () => {}}
      />
    </ThemeProvider>
  );
}

beforeEach(() => { mockRenders.n = 0; });

describe('unchanged props produce no re-render', () => {
  it('the card does not re-render when the parent does', async () => {
    const { getByTestId } = await render(<Harness stable />);
    const after = mockRenders.n;
    expect(after).toBeGreaterThan(0);          // it rendered once to begin with

    await act(async () => { fireEvent.press(getByTestId('rerender')); });
    await act(async () => { fireEvent.press(getByTestId('rerender')); });

    // Two parent renders, zero extra card renders — this is what stops a tab
    // switch re-rendering every mounted card.
    expect(mockRenders.n).toBe(after);
  });
});

describe('the memo depends on the caller', () => {
  it('a fresh closure per render defeats it', async () => {
    // Documented deliberately: this is the regression to watch for. If the
    // feed ever goes back to inline arrows, the memo above stops working and
    // nothing else in the suite would notice.
    const { getByTestId } = await render(<Harness stable={false} />);
    const after = mockRenders.n;

    await act(async () => { fireEvent.press(getByTestId('rerender')); });

    expect(mockRenders.n).toBeGreaterThan(after);
  });
});

describe('the callbacks take an id rather than closing over one', () => {
  it('onReport is called with the confession id', async () => {
    const onReport = jest.fn();
    const { getByLabelText } = await render(
      <ThemeProvider>
        <ReadCard
          text="something" feltCount={1} confessionId="conf-1" personaSeed="conf-1"
          palette={palettes[0]} onReport={onReport}
        />
      </ThemeProvider>,
    );
    await act(async () => { fireEvent.press(getByLabelText(/report/i)); });
    expect(onReport).toHaveBeenCalledWith('conf-1');
  });
});
