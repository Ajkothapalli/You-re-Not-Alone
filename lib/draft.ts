import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@yana/write_draft';

// In-memory mirror so reads are always synchronous after hydration.
// AsyncStorage provides persistence across restarts.
let _mem = '';

// Called once from _layout before any screen renders.
export async function hydrateDraft(): Promise<void> {
  try { _mem = (await AsyncStorage.getItem(KEY)) ?? ''; }
  catch {}
}

// Synchronous — safe to pass as useState initializer.
export const getDraftSync = () => _mem;

export function saveDraft(text: string): void {
  _mem = text;
  AsyncStorage.setItem(KEY, text).catch(() => {});
}

export function clearDraft(): void {
  _mem = '';
  AsyncStorage.removeItem(KEY).catch(() => {});
}
