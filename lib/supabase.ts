/**
 * Supabase client — configured for secure JWT storage.
 *
 * JWTs are stored in expo-secure-store (OS keychain), never AsyncStorage.
 * Client bundle contains only the anon key — no service-role key, no
 * moderation key, no AUTHOR_TOKEN_SECRET.
 */

import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Fallback to placeholder values so the app renders even without real credentials.
// API calls will fail gracefully at runtime instead of crashing the entire app.
const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL      || 'https://placeholder.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

// SecureStore has a 2048-byte value limit per key. Supabase session JSON (access
// token + refresh token + metadata) routinely exceeds this, causing setItemAsync
// to fail silently and the session to not persist. We chunk large values across
// multiple keys (<key>.0, <key>.1, …) to work around the limit.
const CHUNK = 1800; // safely under 2048 with key name overhead

async function chunkedGet(key: string): Promise<string | null> {
  const pieces: string[] = [];
  let i = 0;
  while (true) {
    const part = await SecureStore.getItemAsync(`${key}.${i}`);
    if (part === null) break;
    pieces.push(part);
    i++;
  }
  if (pieces.length > 0) return pieces.join('');
  // Fall back to unchunked key so existing sessions survive the upgrade.
  return SecureStore.getItemAsync(key);
}

async function chunkedSet(key: string, value: string): Promise<void> {
  // Delete the legacy unchunked key (migration path).
  await SecureStore.deleteItemAsync(key).catch(() => {});
  const newCount = Math.ceil(value.length / CHUNK);
  // Write new chunks.
  await Promise.all(
    Array.from({ length: newCount }, (_, i) =>
      SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK)),
    ),
  );
  // Remove any leftover chunks from a previously longer value.
  let old = newCount;
  while ((await SecureStore.getItemAsync(`${key}.${old}`)) !== null) {
    await SecureStore.deleteItemAsync(`${key}.${old}`);
    old++;
  }
}

async function chunkedRemove(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key).catch(() => {});
  let i = 0;
  while ((await SecureStore.getItemAsync(`${key}.${i}`)) !== null) {
    await SecureStore.deleteItemAsync(`${key}.${i}`);
    i++;
  }
}

// Web fallback uses sessionStorage (tokens cleared on tab close; acceptable for dev/web).
const secureStorage: SupportedStorage = Platform.OS === 'web'
  ? {
      getItem:    (key) => sessionStorage.getItem(key),
      setItem:    (key, value) => sessionStorage.setItem(key, value),
      removeItem: (key) => sessionStorage.removeItem(key),
    }
  : {
      getItem:    chunkedGet,
      setItem:    chunkedSet,
      removeItem: chunkedRemove,
    };

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage:            secureStorage,
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: false,
    flowType:           'pkce',
  },
});
