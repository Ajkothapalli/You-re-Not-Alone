import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { showDialog, DialogHost, _resetDialogQueue } from '../../components/AppDialog';

jest.mock('../../lib/a11y', () => ({
  useReducedMotion: jest.fn(() => false),
  announce: jest.fn(),
}));

import { useReducedMotion } from '../../lib/a11y';

beforeEach(() => {
  _resetDialogQueue();
  (useReducedMotion as jest.Mock).mockReturnValue(false);
});

// 1. renders title + message + buttons
test('renders title, message and buttons', async () => {
  const { getByText } = await render(<DialogHost />);
  await act(async () => {
    showDialog('T', 'M', [{ text: 'A' }, { text: 'B' }]);
  });
  expect(getByText('T')).toBeTruthy();
  expect(getByText('M')).toBeTruthy();
  expect(getByText('A')).toBeTruthy();
  expect(getByText('B')).toBeTruthy();
  await act(async () => { fireEvent.press(getByText('A')); });
});

// 2. no buttons → OK that dismisses
test('no buttons defaults to OK that dismisses', async () => {
  const { getByText, queryByText } = await render(<DialogHost />);
  await act(async () => { showDialog('X'); });
  expect(getByText('X')).toBeTruthy();
  expect(getByText('OK')).toBeTruthy();
  await act(async () => { fireEvent.press(getByText('OK')); });
  expect(queryByText('X')).toBeNull();
});

// 3. button onPress called AND dismissed
test('onPress is called and dialog is dismissed', async () => {
  const onPress = jest.fn();
  const { getByText, queryByText } = await render(<DialogHost />);
  await act(async () => { showDialog('Hello', undefined, [{ text: 'Go', onPress }]); });
  expect(getByText('Go')).toBeTruthy();
  await act(async () => { fireEvent.press(getByText('Go')); });
  expect(queryByText('Hello')).toBeNull();
  expect(onPress).toHaveBeenCalledTimes(1);
});

// 4. cancelable:false — scrim press does NOT dismiss, button does
test('cancelable:false — scrim does not dismiss, button does', async () => {
  const { getByText, queryByText, getByTestId } = await render(<DialogHost />);
  await act(async () => { showDialog('NC', 'msg', [{ text: 'OK' }], { cancelable: false }); });
  expect(getByText('NC')).toBeTruthy();
  await act(async () => { fireEvent.press(getByTestId('dialog-scrim')); });
  expect(queryByText('NC')).not.toBeNull();
  await act(async () => { fireEvent.press(getByText('OK')); });
  expect(queryByText('NC')).toBeNull();
});

// 5. cancelable default → backdrop dismisses
test('cancelable default — backdrop press dismisses', async () => {
  const { getByText, queryByText, getByTestId } = await render(<DialogHost />);
  await act(async () => { showDialog('CAN', 'msg', [{ text: 'No' }]); });
  expect(getByText('CAN')).toBeTruthy();
  await act(async () => { fireEvent.press(getByTestId('dialog-scrim')); });
  expect(queryByText('CAN')).toBeNull();
});

// 6. destructive button has testID btn-destructive
test('destructive button has testID btn-destructive', async () => {
  const { getByTestId } = await render(<DialogHost />);
  await act(async () => { showDialog('D', undefined, [{ text: 'Del', style: 'destructive' }]); });
  expect(getByTestId('btn-destructive')).toBeTruthy();
  await act(async () => { fireEvent.press(getByTestId('btn-destructive')); });
});

// 7. cancel button has testID btn-cancel
test('cancel button has testID btn-cancel', async () => {
  const { getByTestId } = await render(<DialogHost />);
  await act(async () => { showDialog('C', undefined, [{ text: 'Cancel', style: 'cancel' }]); });
  expect(getByTestId('btn-cancel')).toBeTruthy();
  await act(async () => { fireEvent.press(getByTestId('btn-cancel')); });
});

// 8. queue: two dialogs shown in order
test('queue shows dialogs in order', async () => {
  const { getByText, queryByText } = await render(<DialogHost />);
  await act(async () => {
    showDialog('First', undefined, [{ text: 'Next' }]);
    showDialog('Second', undefined, [{ text: 'Done' }]);
  });
  expect(getByText('First')).toBeTruthy();
  expect(queryByText('Second')).toBeNull();
  await act(async () => { fireEvent.press(getByText('Next')); });
  expect(getByText('Second')).toBeTruthy();
  await act(async () => { fireEvent.press(getByText('Done')); });
  expect(queryByText('Second')).toBeNull();
});

// 9. keepOpenWhilePending: ActivityIndicator visible while async onPress is pending
test('keepOpenWhilePending shows ActivityIndicator while pending', async () => {
  let resolvePress!: () => void;
  const slowPress = () => new Promise<void>(resolve => { resolvePress = resolve; });

  const { getByTestId, queryByTestId } = await render(<DialogHost />);
  await act(async () => {
    showDialog('Pending', undefined, [
      { text: 'Act', style: 'destructive', keepOpenWhilePending: true, onPress: slowPress },
      { text: 'Cancel', style: 'cancel' },
    ]);
  });

  expect(getByTestId('btn-destructive')).toBeTruthy();

  // Start the press (this sets pendingIndex) without awaiting the resolution
  await act(async () => {
    // fireEvent.press triggers handleButtonPress which sets pendingIndex then awaits slowPress
    // We need to trigger the press but not block on the async resolution
    fireEvent.press(getByTestId('btn-destructive'));
    // Flush microtasks so setPendingIndex state update commits
    await Promise.resolve();
  });

  await waitFor(() => expect(queryByTestId('btn-pending-indicator')).not.toBeNull());

  await act(async () => { resolvePress(); });
});

// 10. reduced motion renders correctly (scale starts at 1)
test('reduced motion renders correctly', async () => {
  (useReducedMotion as jest.Mock).mockReturnValue(true);
  const { getByText, queryByText } = await render(<DialogHost />);
  await act(async () => { showDialog('RM', 'test'); });
  await waitFor(() => expect(getByText('RM')).toBeTruthy());
  await act(async () => { fireEvent.press(getByText('OK')); });
  expect(queryByText('RM')).toBeNull();
});
