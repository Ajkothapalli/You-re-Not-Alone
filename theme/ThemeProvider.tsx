import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { type Palette, palettes } from './palettes';
import { type ColorSet, lightColors, darkColors } from './tokens';

const OPEN_COUNT_KEY = '@yana/open_count';
const THEME_KEY      = '@yana/theme';

export type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  palette:      Palette;
  paletteIndex: number;
  theme:        ThemeMode;
  setTheme:     (t: ThemeMode) => void;
  colors:       ColorSet;
  isDark:       boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  palette:      palettes[0],
  paletteIndex: 0,
  theme:        'light',
  setTheme:     () => {},
  colors:       lightColors,
  isDark:       false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [theme,        setThemeState]   = useState<ThemeMode>('light');

  useEffect(() => {
    (async () => {
      try {
        // Palette rotation
        const stored = await AsyncStorage.getItem(OPEN_COUNT_KEY);
        const prev   = stored ? parseInt(stored, 10) : 0;
        const next   = prev + 1;
        await AsyncStorage.setItem(OPEN_COUNT_KEY, String(next));
        setPaletteIndex((next - 1) % palettes.length);

        // Theme preference
        const savedTheme = await AsyncStorage.getItem(THEME_KEY);
        if (savedTheme === 'dark' || savedTheme === 'light') {
          setThemeState(savedTheme);
        }
      } catch {
        setPaletteIndex(0);
      }
    })();
  }, []);

  const setTheme = useCallback(async (t: ThemeMode) => {
    setThemeState(t);
    try { await AsyncStorage.setItem(THEME_KEY, t); } catch {}
  }, []);

  const isDark = theme === 'dark';
  const colors = isDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{
      palette: palettes[paletteIndex],
      paletteIndex,
      theme,
      setTheme,
      colors,
      isDark,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** Returns the current Palette object (rotating accent colors). */
export function usePalette(): Palette {
  return useContext(ThemeContext).palette;
}

/** Returns the current 0-based palette index (0–5). */
export function usePaletteIndex(): number {
  return useContext(ThemeContext).paletteIndex;
}

/** Returns the active ColorSet (light or dark). */
export function useThemeColors(): ColorSet {
  return useContext(ThemeContext).colors;
}

/** Returns full theme context: colors, theme name, isDark, setTheme. */
export function useTheme(): Pick<ThemeContextValue, 'colors' | 'theme' | 'isDark' | 'setTheme'> {
  const { colors, theme, isDark, setTheme } = useContext(ThemeContext);
  return { colors, theme, isDark, setTheme };
}
