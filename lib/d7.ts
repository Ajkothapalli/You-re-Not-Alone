import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@yana/install_ts';
const D7_MS = 7 * 24 * 60 * 60 * 1000;

/** Call once on first successful login. Idempotent — will not overwrite existing date. */
export async function markInstall(): Promise<void> {
  try {
    const existing = await AsyncStorage.getItem(KEY);
    if (!existing) await AsyncStorage.setItem(KEY, String(Date.now()));
  } catch {}
}

/** True if fewer than 7 days have passed since first install/login. */
export async function isD7(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return true; // not yet recorded → treat as D0
    return Date.now() - Number(raw) < D7_MS;
  } catch {
    return false;
  }
}
