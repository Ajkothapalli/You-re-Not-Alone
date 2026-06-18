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

// SecureStore adapter for Supabase auth.
// Web fallback uses sessionStorage (tokens cleared on tab close; acceptable for dev/web).
const secureStorage: SupportedStorage = Platform.OS === 'web'
  ? {
      getItem:    (key) => sessionStorage.getItem(key),
      setItem:    (key, value) => sessionStorage.setItem(key, value),
      removeItem: (key) => sessionStorage.removeItem(key),
    }
  : {
      getItem:    (key) => SecureStore.getItemAsync(key),
      setItem:    (key, value) => SecureStore.setItemAsync(key, value),
      removeItem: (key) => SecureStore.deleteItemAsync(key),
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
