/**
 * Stable per-install device identifier, stored in expo-secure-store (OS keychain).
 *
 * Derived from: expo-device attributes + 16 random bytes.
 * Hashed with SHA-256 so raw device info never leaves the device.
 * Cached after first derivation — survives app restarts, not reinstalls.
 *
 * The server also computes its own hash from IP + user-agent as a second layer.
 * This client hash identifies the physical device across IP changes.
 */

import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';

const STORE_KEY = 'yana.device_hash';

export async function getDeviceHash(): Promise<string> {
  const cached = await SecureStore.getItemAsync(STORE_KEY);
  if (cached) return cached;

  // Combine stable device attributes with random entropy so even two identical
  // physical devices get different hashes.
  const entropy = Crypto.randomUUID();
  const raw = [
    Device.modelId    ?? 'unknown_model',
    Device.osName     ?? 'unknown_os',
    Device.osVersion  ?? 'unknown_ver',
    Device.deviceName ?? 'unknown_device',
    entropy,
  ].join(':');

  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    raw,
  );

  await SecureStore.setItemAsync(STORE_KEY, hash);
  return hash;
}
