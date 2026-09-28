/**
 * Which look a share opens on.
 *
 * Every share starts on the look AFTER the one used last time, so someone who
 * shares twice does not post the same picture twice. The index is persisted
 * because that rotation is only useful across sessions — within one session
 * nobody shares six times.
 *
 * Every failure here is silent and falls back to the first look: a storage
 * error must not stop someone sharing, and the cost of getting this wrong is
 * that two cards look alike.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { LOOK_IDS, nextLook, lookIndex, type LookId } from './shareLooks';

const KEY = '@yana/share_look_index';

/** The look this share should open on. Never throws. */
export async function openingLook(): Promise<LookId> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === null) return LOOK_IDS[0];
    const n = Number.parseInt(raw, 10);
    return nextLook(Number.isFinite(n) ? n : null);
  } catch {
    return LOOK_IDS[0];
  }
}

/** Remember the look actually shared, so the next share moves on from it. */
export async function rememberLook(look: LookId): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, String(lookIndex(look)));
  } catch {
    // A share that happened is not worth failing over a preference write.
  }
}
