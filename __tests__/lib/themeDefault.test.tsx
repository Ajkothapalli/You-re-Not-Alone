/**
 * The app opens LIGHT unless someone has chosen otherwise.
 *
 * Owner decision 2026-09-18. This file previously asserted the opposite —
 * that the theme follows the OS colour scheme — which was set on 2026-09-17
 * when the FTUE's Appearance beat was cut.
 *
 * That default was wrong twice over. Light is the product's resting state and
 * a first launch should not depend on a setting made elsewhere; and it never
 * followed the OS anyway, because app.json pinned `userInterfaceStyle: "dark"`,
 * which forces the native style and makes useColorScheme() return 'dark' on
 * every device. "Follow the OS" therefore meant "always dark", for everyone,
 * and shipped that way in the first dictation APK.
 *
 * The pin is now "light", and this provider no longer consults the OS at all —
 * one fewer thing that can silently decide the answer.
 */

import React from 'react';
import { Text } from 'react-native';
import { render, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Set to dark on purpose: if the provider ever starts consulting the OS again,
// these tests fail rather than quietly passing on a light simulator.
const mockColorScheme = jest.fn(() => 'dark');
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default:    () => mockColorScheme(),
}));

import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

function Probe() {
  const { theme, isDark, setTheme } = useTheme();
  (Probe as any).setTheme = setTheme;
  return <Text testID="theme">{`${theme}:${isDark}`}</Text>;
}

function renderProbe() {
  // render() is async in this version of @testing-library/react-native — the
  // caller must await it, or the destructured queries are undefined.
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockColorScheme.mockReturnValue('dark');
  await AsyncStorage.clear();
});

describe('theme default', () => {
  it('opens light on a fresh install', async () => {
    const { getByTestId } = await renderProbe();
    await waitFor(() => expect(getByTestId('theme').props.children).toBe('light:false'));
  });

  it('stays light even when the OS reports dark', async () => {
    mockColorScheme.mockReturnValue('dark');
    const { getByTestId } = await renderProbe();
    await waitFor(() => expect(getByTestId('theme').props.children).toBe('light:false'));
  });

  it('a stored dark choice wins', async () => {
    await AsyncStorage.setItem('@yana/theme', 'dark');
    const { getByTestId } = await renderProbe();
    await waitFor(() => expect(getByTestId('theme').props.children).toBe('dark:true'));
  });

  it('a stored light choice is honoured too', async () => {
    await AsyncStorage.setItem('@yana/theme', 'light');
    const { getByTestId } = await renderProbe();
    await waitFor(() => expect(getByTestId('theme').props.children).toBe('light:false'));
  });

  it('setTheme persists, so the choice survives the next launch', async () => {
    const { getByTestId } = await renderProbe();
    await act(async () => { await (Probe as any).setTheme('dark'); });
    await waitFor(() => expect(getByTestId('theme').props.children).toBe('dark:true'));
    expect(await AsyncStorage.getItem('@yana/theme')).toBe('dark');
  });

  it('switching back to light persists as well', async () => {
    await AsyncStorage.setItem('@yana/theme', 'dark');
    const { getByTestId } = await renderProbe();
    await waitFor(() => expect(getByTestId('theme').props.children).toBe('dark:true'));
    await act(async () => { await (Probe as any).setTheme('light'); });
    await waitFor(() => expect(getByTestId('theme').props.children).toBe('light:false'));
    expect(await AsyncStorage.getItem('@yana/theme')).toBe('light');
  });

  it('the native style pin is not dark', () => {
    // The JS default is only half the fix: app.json's userInterfaceStyle sets
    // the native window style, and "dark" there paints the shell dark before
    // any of this runs.
    const app = require('../../app.json');
    expect(app.expo.userInterfaceStyle).not.toBe('dark');
  });
});
