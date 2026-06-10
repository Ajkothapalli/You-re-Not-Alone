import {
  Fraunces_400Regular,
  Fraunces_400Regular_Italic,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import {
  Inter_400Regular,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { useFonts as _useFonts } from 'expo-font';

/** Load all app fonts. Returns [loaded, error] from expo-font. */
export function useAppFonts(): [boolean, Error | null] {
  const [loaded, error] = _useFonts({
    Fraunces_400Regular,
    Fraunces_400Regular_Italic,
    Fraunces_700Bold,
    Inter_400Regular,
    Inter_600SemiBold,
  });
  return [loaded, error];
}
