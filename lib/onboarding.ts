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

// ── FTUE (first-time user experience) ─────────────────────────────────────────
// Tracks whether the new-user illustrated onboarding (app/welcome.tsx) has
// been completed. Separate key from intro-reads so they don't interfere.

const FTUE_KEY = '@yana/ftue_done';

export async function hasDoneFtue(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(FTUE_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markFtueDone(): Promise<void> {
  await AsyncStorage.setItem(FTUE_KEY, '1').catch(() => {});
}

/** Dev helper — resets FTUE so the welcome screen shows again on next new-user auth. */
export async function resetFtue(): Promise<void> {
  await AsyncStorage.removeItem(FTUE_KEY).catch(() => {});
}
