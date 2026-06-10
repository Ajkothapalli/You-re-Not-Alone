import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { type Palette, palettes } from './palettes';

const OPEN_COUNT_KEY = '@yana/open_count';

interface ThemeContextValue {
  palette:      Palette;
  paletteIndex: number;
}

const ThemeContext = createContext<ThemeContextValue>({
  palette:      palettes[0],
  paletteIndex: 0,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [paletteIndex, setPaletteIndex] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(OPEN_COUNT_KEY);
        const prev   = stored ? parseInt(stored, 10) : 0;
        const next   = prev + 1;
        await AsyncStorage.setItem(OPEN_COUNT_KEY, String(next));
        // open #1 → index 0, open #2 → index 1, …
        setPaletteIndex((next - 1) % palettes.length);
      } catch {
        setPaletteIndex(0);
      }
    })();
  }, []);

  return (
    <ThemeContext.Provider value={{ palette: palettes[paletteIndex], paletteIndex }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** Returns the current Palette object. */
export function usePalette(): Palette {
  return useContext(ThemeContext).palette;
}

/** Returns the current 0-based palette index (0–5). */
export function usePaletteIndex(): number {
  return useContext(ThemeContext).paletteIndex;
}
