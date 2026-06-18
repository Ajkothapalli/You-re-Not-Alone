/**
 * WebCrypto polyfill for Supabase PKCE in React Native / Hermes.
 *
 * Hermes doesn't expose crypto.subtle, so Supabase JS falls back to
 * PKCE plain mode which some auth servers reject. This bridges
 * expo-crypto's digest API into the WebCrypto shape Supabase expects.
 *
 * Import this file as the very first import in app/_layout.tsx.
 */

import * as ExpoC from 'expo-crypto';

function hexToArrayBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes.buffer;
}

const subtlePolyfill = {
  digest: async (algorithm: string, data: ArrayBuffer | Uint8Array): Promise<ArrayBuffer> => {
    const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    // Convert bytes back to string — PKCE verifier is always ASCII (base64url)
    const str = Array.from(uint8)
      .map(b => String.fromCharCode(b))
      .join('');
    const algoKey = algorithm.replace('-', '') as keyof typeof ExpoC.CryptoDigestAlgorithm;
    const hex = await ExpoC.digestStringAsync(
      ExpoC.CryptoDigestAlgorithm[algoKey] ?? ExpoC.CryptoDigestAlgorithm.SHA256,
      str,
      { encoding: ExpoC.CryptoEncoding.HEX },
    );
    return hexToArrayBuffer(hex);
  },
};

if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = {
    getRandomValues: ExpoC.getRandomValues,
    subtle:          subtlePolyfill,
  };
} else {
  if (typeof (globalThis.crypto as any).subtle === 'undefined') {
    (globalThis.crypto as any).subtle = subtlePolyfill;
  }
  if (typeof globalThis.crypto.getRandomValues === 'undefined') {
    (globalThis.crypto as any).getRandomValues = ExpoC.getRandomValues;
  }
}
