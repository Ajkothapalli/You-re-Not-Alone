/**
 * [NAV] The bar reads the navigator, and a tap on the active tab does nothing.
 *
 * WriteFAB is the tab navigator's own tabBar now, so its props ARE the
 * navigation state. That is the whole reason the indicator can move on the
 * tap frame: state.index changes in the same commit as the press, where
 * usePathname only changed once the navigation had finished — which is what
 * the optimistic/TTL cache in the deleted lib/tabNav.ts existed to paper over.
 */

const mockNavigate = jest.fn();

jest.mock('@/lib/notificationsContext', () => ({
  useNotificationsContext: () => ({ unreadCount: 0, setUnreadCount: jest.fn() }),
}));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import WriteFAB from '@/components/WriteFAB';
import { ThemeProvider } from '@/theme/ThemeProvider';

const ROUTE_NAMES = ['explore', 'write', 'you', 'notifications'];

function bar(index: number) {
  return render(
    <ThemeProvider>
      <WriteFAB
        state={{ index, routeNames: ROUTE_NAMES }}
        navigation={{ navigate: mockNavigate }}
      />
    </ThemeProvider>,
  );
}

beforeEach(() => { mockNavigate.mockClear(); });

describe('the tab bar', () => {
  it('marks the tab the NAVIGATOR says is active, not one it works out itself', async () => {
    const u = await bar(2);
    expect(u.getByLabelText('You').props.accessibilityState.selected).toBe(true);
    for (const other of ['Read', 'Write', 'Alerts']) {
      expect(u.getByLabelText(other).props.accessibilityState.selected).toBe(false);
    }
  });

  it('switches by route NAME, so the navigator resolves it as a jump', async () => {
    const u = await bar(0);
    fireEvent.press(u.getByLabelText('Alerts'));
    expect(mockNavigate).toHaveBeenCalledWith('notifications');
    // A path would go through the linking layer and could resolve to a push.
    expect(mockNavigate).not.toHaveBeenCalledWith('/notifications');
  });

  it('does nothing when you tap the tab you are already on', async () => {
    // Navigating to the current tab would re-run its focus effects — on Read
    // that means losing the reader's place, and on Alerts it means marking
    // notifications read again. Doing nothing is the behaviour, not a gap.
    const u = await bar(0);
    fireEvent.press(u.getByLabelText('Read'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // One test per tab rather than a loop: repeated render() calls inside a
  // single test share a root, and the later ones could not find their own
  // elements. it.each gets each render its own cleanup.
  it.each([
    ['Read',   'explore',       1],
    ['Write',  'write',         0],
    ['You',    'you',           0],
    ['Alerts', 'notifications', 0],
  ] as [string, string, number][])(
    '%s goes to the %s route', async (label, route, from) => {
      // Rendered from a tab that is NOT the target, so the no-op guard above
      // cannot be what makes this pass.
      const u = await bar(from);
      fireEvent.press(u.getByLabelText(label));
      expect(mockNavigate).toHaveBeenCalledWith(route);
    });
});
