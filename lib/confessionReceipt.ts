import AsyncStorage from '@react-native-async-storage/async-storage';

const RECEIPTS_KEY = 'confession_receipts_v1';
const SEEN_KEY     = 'confession_receipts_seen_v1';
const MAX_RECEIPTS = 20;

export interface ConfessionReceipt {
  id:                string;
  feltCountAtSubmit: number;
  text?:             string;  // on-device author text; added 2026-06-30
}

export async function saveReceipt(id: string, feltCountAtSubmit: number, text?: string): Promise<void> {
  const existing = await getReceipts();
  const updated  = [{ id, feltCountAtSubmit, text }, ...existing.filter(r => r.id !== id)].slice(0, MAX_RECEIPTS);
  await AsyncStorage.setItem(RECEIPTS_KEY, JSON.stringify(updated));
  await AsyncStorage.removeItem(SEEN_KEY);
}

export async function getReceipts(): Promise<ConfessionReceipt[]> {
  try {
    const raw = await AsyncStorage.getItem(RECEIPTS_KEY);
    return raw ? (JSON.parse(raw) as ConfessionReceipt[]) : [];
  } catch {
    return [];
  }
}

export async function markSeen(): Promise<void> {
  await AsyncStorage.setItem(SEEN_KEY, '1');
}

export async function hasSeen(): Promise<boolean> {
  return (await AsyncStorage.getItem(SEEN_KEY)) === '1';
}

export async function clearReceipts(): Promise<void> {
  await AsyncStorage.multiRemove([RECEIPTS_KEY, SEEN_KEY]);
}
