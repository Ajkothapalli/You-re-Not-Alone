jest.mock('@/components/Celebration', () => {
  const React = require('react');
  return {
    Celebration: ({ onDone }: { onDone: () => void }) => {
      React.useEffect(() => { onDone(); }, []);
      return null;
    },
  };
});

jest.mock('@/components/ConfessionCard', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => React.createElement(View, { testID: 'ConfessionCard' }),
    WaveBackground: () => null,
  };
});

jest.mock('@/components/StoryCard', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { StoryCard: React.forwardRef((_p: any, ref: any) => React.createElement(View, { ref, testID: 'StoryCard' })) };
});

jest.mock('@/components/AppDialog', () => ({
  showDialog: jest.fn(),
}));

jest.mock('@/lib/analytics', () => ({
  analytics: { matchShown: jest.fn(), cardShared: jest.fn() },
}));

jest.mock('@/lib/shareCard', () => ({
  shareConfessionCard: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/theme/ThemeProvider', () => ({
  usePalette: () => ({ name: 'test', you: '#F5996E', them: '#FBBF24', bands: ['#4C40A4'] }),
}));

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import MatchScreen from '../../app/match';

const mockBack    = router.back    as jest.Mock;
const mockUseLocalSearchParams = useLocalSearchParams as jest.Mock;

const NO_MATCH_PARAMS = {
  youText:      'I never told anyone this.',
  themText:     '',
  feltCount:    '1',
  confessionId: 'conf-001',
  noMatch:      '1',
};

const MATCH_PARAMS = {
  youText:      'I never told anyone this.',
  themText:     'Neither did I, until now.',
  feltCount:    '42',
  confessionId: 'conf-002',
  noMatch:      '0',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('MatchScreen — no-match path', () => {
  beforeEach(() => {
    mockUseLocalSearchParams.mockReturnValue(NO_MATCH_PARAMS);
  });

  it('renders "Take me to feed" primary button', async () => {
    const { getByText } = await render(<MatchScreen />);
    expect(getByText('Take me to feed')).toBeTruthy();
  });

  it('"Take me to feed" calls router.back()', async () => {
    const { getByText } = await render(<MatchScreen />);
    await act(async () => { fireEvent.press(getByText('Take me to feed')); });
    expect(mockBack).toHaveBeenCalled();
  });

  it('shows the unlock hint text', async () => {
    const { getByText } = await render(<MatchScreen />);
    expect(getByText('writing just unlocked 2 more reads')).toBeTruthy();
  });

  it('does NOT render report link', async () => {
    const { queryByText } = await render(<MatchScreen />);
    expect(queryByText(/report this confession/i)).toBeNull();
  });

  it('does NOT render "Write one more" or "Write another"', async () => {
    const { queryByText } = await render(<MatchScreen />);
    expect(queryByText(/write one more/i)).toBeNull();
    expect(queryByText(/write another/i)).toBeNull();
  });
});

describe('MatchScreen — match path', () => {
  beforeEach(() => {
    mockUseLocalSearchParams.mockReturnValue(MATCH_PARAMS);
  });

  it('renders the ConfessionCard', async () => {
    const { getByTestId } = await render(<MatchScreen />);
    expect(getByTestId('ConfessionCard')).toBeTruthy();
  });

  it('renders "Share this moment" as the primary button', async () => {
    const { getByText } = await render(<MatchScreen />);
    expect(getByText('Share this moment')).toBeTruthy();
  });

  it('renders "Take me to feed" ghost button', async () => {
    const { getByText } = await render(<MatchScreen />);
    expect(getByText('Take me to feed')).toBeTruthy();
  });

  it('"Take me to feed" calls router.back()', async () => {
    const { getByText } = await render(<MatchScreen />);
    await act(async () => { fireEvent.press(getByText('Take me to feed')); });
    expect(mockBack).toHaveBeenCalled();
  });

  it('shows the unlock hint text', async () => {
    const { getByText } = await render(<MatchScreen />);
    expect(getByText('writing just unlocked 2 more reads')).toBeTruthy();
  });

  it('does NOT render report link', async () => {
    const { queryByText } = await render(<MatchScreen />);
    expect(queryByText(/report this confession/i)).toBeNull();
  });

  it('does NOT render CounterPill (count already in card)', async () => {
    const { queryByTestId } = await render(<MatchScreen />);
    expect(queryByTestId('CounterPill')).toBeNull();
  });

  it('"Share this moment" invokes shareConfessionCard', async () => {
    const { shareConfessionCard } = require('@/lib/shareCard');
    const { getByText } = await render(<MatchScreen />);
    await act(async () => { fireEvent.press(getByText('Share this moment')); });
    expect(shareConfessionCard).toHaveBeenCalled();
  });
});
