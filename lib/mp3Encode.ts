/**
 * WAV → MP3, on device, before anything is uploaded.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * The spec asked for AAC ~32kbps. That is not reachable with the SDK 56
 * modules: the only recorder that can transcribe and capture from ONE mic
 * stream is expo-speech-recognition's `recordingOptions.persist`, and it emits
 * WAV (Android) / CAF (iOS) with no codec option. Running expo-audio's AAC
 * recorder alongside the recogniser would mean two mic consumers, which Android
 * does not reliably allow.
 *
 * ffmpeg-kit-react-native was the obvious transcoder and was retired in
 * January 2025 (binaries pulled). So the encode happens in JS.
 *
 * The size difference is not cosmetic: 16 kHz 16-bit mono PCM is 32 KB/s, so a
 * 3-minute recording is ~5.8 MB. At 32 kbps mono MP3 the same recording is
 * ~720 KB. That is 8× on every upload, on storage, and — the binding one — on
 * egress every time somebody presses play.
 *
 * ── Cost, stated plainly ────────────────────────────────────────────────────
 * This is a pure-JS encoder. On a low-end Android, three minutes of audio takes
 * real seconds to encode, so callers MUST show progress and must not block the
 * UI thread pretending it is instant. `onProgress` exists for that and is not
 * optional in spirit.
 */

import { Mp3Encoder } from '@breezystack/lamejs';

/** Matches the storage bucket's declared mime type and the spec's bitrate. */
export const MP3_BITRATE_KBPS = 32;
export const MP3_MIME         = 'audio/mpeg';

/** lamejs works on blocks; 1152 samples is one MPEG frame. */
const SAMPLES_PER_FRAME = 1152;

export interface PcmAudio {
  /** Interleaved 16-bit signed samples. Mono expected. */
  samples:    Int16Array;
  sampleRate: number;
  channels:   number;
}

/**
 * Minimal RIFF/WAVE parser.
 *
 * Deliberately strict: it reads the fmt chunk rather than assuming a 44-byte
 * header, because the recorder's output is not guaranteed to be canonical and
 * a wrong offset here produces audio that is silently noise — which the writer
 * would only discover after posting their voice to strangers.
 */
export function parseWav(bytes: Uint8Array): PcmAudio {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const tag = (off: number) =>
    String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);

  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') {
    throw new Error('Not a WAV file');
  }

  let sampleRate = 0;
  let channels   = 0;
  let bitsPer    = 0;
  let dataOff    = -1;
  let dataLen    = 0;

  // Walk the chunks. Never assume fmt is first or data is at 44.
  let off = 12;
  while (off + 8 <= bytes.length) {
    const id   = tag(off);
    const size = view.getUint32(off + 4, true);
    const body = off + 8;

    if (id === 'fmt ') {
      channels   = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPer    = view.getUint16(body + 14, true);
    } else if (id === 'data') {
      dataOff = body;
      dataLen = size;
    }

    // Chunks are word-aligned.
    off = body + size + (size % 2);
  }

  if (dataOff < 0 || !sampleRate || !channels) throw new Error('WAV missing fmt or data chunk');
  if (bitsPer !== 16) throw new Error(`Unsupported WAV bit depth: ${bitsPer}`);

  const available = Math.min(dataLen, bytes.length - dataOff);
  const samples = new Int16Array(
    bytes.buffer.slice(bytes.byteOffset + dataOff, bytes.byteOffset + dataOff + (available & ~1)),
  );

  return { samples, sampleRate, channels };
}

/** Average the channels down to one. The bucket and the bitrate both assume mono. */
export function toMono({ samples, sampleRate, channels }: PcmAudio): PcmAudio {
  if (channels === 1) return { samples, sampleRate, channels: 1 };

  const frames = Math.floor(samples.length / channels);
  const mono   = new Int16Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += samples[i * channels + c];
    mono[i] = (sum / channels) | 0;
  }
  return { samples: mono, sampleRate, channels: 1 };
}

/**
 * Encode mono PCM to MP3.
 *
 * `onProgress` receives 0..1. Yielding between chunks is what keeps the UI
 * responsive; without it a three-minute encode freezes the app and the writer
 * assumes it crashed mid-post.
 */
export async function encodeMp3(
  audio: PcmAudio,
  onProgress?: (fraction: number) => void,
): Promise<Uint8Array> {
  const mono = toMono(audio);
  const encoder = new Mp3Encoder(1, mono.sampleRate, MP3_BITRATE_KBPS);

  const chunks: Uint8Array[] = [];
  const total = mono.samples.length;

  // Yield roughly every 50 frames (~3.6s of 16 kHz audio) so the JS thread can
  // paint. Tuned for responsiveness, not throughput.
  const YIELD_EVERY = SAMPLES_PER_FRAME * 50;
  let sinceYield = 0;

  for (let i = 0; i < total; i += SAMPLES_PER_FRAME) {
    const block = mono.samples.subarray(i, Math.min(i + SAMPLES_PER_FRAME, total));
    const buf = encoder.encodeBuffer(block);
    if (buf.length > 0) chunks.push(new Uint8Array(buf));

    sinceYield += SAMPLES_PER_FRAME;
    if (sinceYield >= YIELD_EVERY) {
      sinceYield = 0;
      onProgress?.(Math.min(i / total, 0.99));
      // Give the event loop a turn.
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(new Uint8Array(tail));
  onProgress?.(1);

  const size = chunks.reduce((n, c) => n + c.length, 0);
  const out  = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/** Duration in ms, from the PCM itself rather than a timer the UI kept. */
export function durationMs({ samples, sampleRate, channels }: PcmAudio): number {
  const frames = samples.length / Math.max(channels, 1);
  return Math.round((frames / sampleRate) * 1000);
}
