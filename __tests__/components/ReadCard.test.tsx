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

// ─── [H1] Headlines ──────────────────────────────────────────────────────────

describe('the headline', () => {
  const HEADLINE = 'the day I stopped calling';
  const BODY = 'I still keep the last voicemail. The day I stopped calling was the day I started pretending.';

  it('renders above the confession, not instead of it', async () => {
    const u = await render(<ReadCard {...mkProps({ text: BODY, headline: HEADLINE })} />);
    // Both present. A headline that replaced the text would be a summary,
    // which is the one thing this feature is built not to be.
    expect(u.getByText(HEADLINE)).toBeTruthy();
    expect(u.getByText(BODY)).toBeTruthy();
  });

  it('is bold, and heavier than the body', async () => {
    const u = await render(<ReadCard {...mkProps({ text: BODY, headline: HEADLINE })} />);
    const head = u.getByText(HEADLINE);
    const body = u.getByText(BODY);
    const flat = (n: { props: Record<string, unknown> }) =>
      Object.assign({}, ...[n.props.style].flat(Infinity).filter(Boolean)) as
        Record<string, number | string>;

    /**
     * The two are the SAME SIZE (19), which is what the brief asked for, so
     * the contrast is carried entirely by face and weight: bold sans over
     * regular serif. Asserted that way rather than on size, because a test
     * demanding a bigger number would fail the design that was specified.
     */
    expect(flat(head).fontFamily).toMatch(/Bold/i);
    expect(flat(body).fontFamily).not.toMatch(/Bold/i);
    expect(flat(head).fontFamily).not.toBe(flat(body).fontFamily);
    // Tighter leading, so two lines of headline read as one block rather
    // than as the first two lines of the confession.
    expect(Number(flat(head).lineHeight)).toBeLessThan(Number(flat(body).lineHeight));
  });

  it('never runs past two lines', async () => {
    // Three lines of bold has stopped being a headline and started being the
    // confession, which is directly underneath it anyway.
    const u = await render(<ReadCard {...mkProps({ text: BODY, headline: HEADLINE })} />);
    expect(u.getByText(HEADLINE).props.numberOfLines).toBe(2);
  });

  it('a card with no headline renders exactly as it did before', async () => {
    /**
     * Most confessions have none — every short one, and any whose writer
     * removed theirs — so "no headline" is the common case, not the edge.
     * Snapshotted against the same card WITH the prop absent entirely, so a
     * stray wrapper View or a margin left behind by the headline block shows
     * up here rather than on a device.
     */
    const without = await render(<ReadCard {...mkProps({ text: BODY })} />);
    expect(without.toJSON()).toMatchSnapshot('read-card without headline');
    expect(without.queryByText(HEADLINE)).toBeNull();
  });

  it('an explicitly undefined headline is the same as none', async () => {
    const u = await render(<ReadCard {...mkProps({ text: BODY, headline: undefined })} />);
    expect(u.toJSON()).toMatchSnapshot('read-card without headline');
  });

  it('does not announce itself as a heading', async () => {
    // The card is one continuous quote from one person. Announcing structure
    // inside it would tell a screen-reader user there is a hierarchy here
    // that a sighted reader can see and they cannot.
    const u = await render(<ReadCard {...mkProps({ text: BODY, headline: HEADLINE })} />);
    expect(u.getByText(HEADLINE).props.accessibilityRole).toBeUndefined();
  });
});

describe('sharing a confession from the feed', () => {
  /**
   * Share used to be reachable only through a nudge that appears once a
   * session, and only on a confession already past 50 felts — so almost
   * nothing in the feed could be shared, and what could was what least
   * needed the help. It is a control on the card now.
   */
  it('offers share when the feed supplies a handler', async () => {
    const onShare = jest.fn();
    const { getByLabelText } = await render(
      <ReadCard {...mkProps({ onShare, confessionId: 'c-1' })} />,
    );
    expect(getByLabelText('Share this confession')).toBeTruthy();
  });

  it('hands back the confession id, not a closure over the row', async () => {
    // ReadCard is memoized on the assumption that callers keep ONE stable
    // callback for the whole list and the card says which confession it is.
    const onShare = jest.fn();
    const { getByLabelText } = await render(
      <ReadCard {...mkProps({ onShare, confessionId: 'c-42' })} />,
    );
    fireEvent.press(getByLabelText('Share this confession'));
    expect(onShare).toHaveBeenCalledWith('c-42');
  });

  it('draws nothing when the caller passes no handler', async () => {
    // Opt-in rather than always-on. app/read-detail.tsx passes none today,
    // so the full-text screen has no share — a known gap, recorded here so
    // it is not mistaken for intent.
    const { queryByLabelText } = await render(<ReadCard {...mkProps()} />);
    expect(queryByLabelText('Share this confession')).toBeNull();
  });

  it('does not make the whole card a share button', async () => {
    // The card's own press opens the confession. A share that swallowed
    // that would cost the reader the thing they actually tapped for.
    const onShare = jest.fn();
    const onPress = jest.fn();
    const { getByLabelText } = await render(
      <ReadCard {...mkProps({ onShare, onPress, confessionId: 'c-7' })} />,
    );
    fireEvent.press(getByLabelText('Share this confession'));
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });
});
