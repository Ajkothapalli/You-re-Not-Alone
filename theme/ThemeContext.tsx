import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Palette, palettes } from './palettes';

const OPEN_COUNT_KEY = '@yana:openCount';

interface ThemeContextValue {
  palette: Palette;
  paletteIndex: number;
}

const ThemeContext = createContext<ThemeContextValue>({
  palette: palettes[0],
  paletteIndex: 0,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [paletteIndex, setPaletteIndex] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(OPEN_COUNT_KEY);
        const count = stored ? parseInt(stored, 10) : 0;
        const nextCount = count + 1;
        await AsyncStorage.setItem(OPEN_COUNT_KEY, String(nextCount));
        // Open #k → palette index (k-1) % 6
        setPaletteIndex((nextCount - 1) % palettes.length);
      } catch {
        // Fallback to first palette if storage fails
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

export const useTheme = () => useContext(ThemeContext);
