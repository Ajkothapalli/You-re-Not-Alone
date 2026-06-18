import AsyncStorage from '@react-native-async-storage/async-storage';

// v2: never set on empty-pool bypass (bug in v1 permanently blocked the screen)
const KEY = '@yana/intro_reads_done_v2';

export async function hasDoneIntroReads(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function markIntroReadsDone(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, 'true');
  } catch {}
}

/** Dev helper — call once to re-surface the read screen on next launch. */
export async function resetIntroReads(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {}
}
