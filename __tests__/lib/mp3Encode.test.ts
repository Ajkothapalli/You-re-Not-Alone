/**
 * WAV parsing and MP3 encoding.
 *
 * These are pure functions operating on bytes, which makes them the one part of
 * the voice feature that can be verified properly without a device — and the
 * part where a mistake is invisible. A wrong data-chunk offset does not throw;
 * it produces noise, and the writer discovers it only after their voice is
 * already playing to strangers.
 */

import { parseWav, toMono, encodeMp3, durationMs, MP3_BITRATE_KBPS } from '@/lib/mp3Encode';

/** Build a canonical 16-bit PCM WAV. */
function makeWav(opts: {
  sampleRate?: number;
  channels?:   number;
  frames?:     number;
  /** Extra chunk inserted before `data`, to prove the parser walks chunks. */
  extraChunk?: boolean;
}): Uint8Array {
  const sampleRate = opts.sampleRate ?? 16000;
  const channels   = opts.channels   ?? 1;
  const frames     = opts.frames     ?? 16000;
  const dataBytes  = frames * channels * 2;

  const extra = opts.extraChunk ? 8 + 4 : 0;
  const buf   = new ArrayBuffer(44 + extra + dataBytes);
  const view  = new DataView(buf);
  const bytes = new Uint8Array(buf);

  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) bytes[off + i] = s.charCodeAt(i);
  };

  str(0, 'RIFF');
  view.setUint32(4, buf.byteLength - 8, true);
  str(8, 'WAVE');

  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);                       // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);                      // bits per sample

  let off = 36;
  if (opts.extraChunk) {
    // A LIST chunk of 4 bytes. Real recorders emit these; a parser that assumes
    // data starts at byte 44 reads the audio 12 bytes off and produces noise.
    str(off, 'LIST'); view.setUint32(off + 4, 4, true);
    off += 12;
  }

  str(off, 'data');
  view.setUint32(off + 4, dataBytes, true);
  const dataStart = off + 8;

  // A recognisable ramp, so a misaligned read is detectable.
  for (let i = 0; i < frames * channels; i++) {
    view.setInt16(dataStart + i * 2, (i % 1000) * 30 - 15000, true);
  }
  return bytes;
}

describe('parseWav', () => {
  it('reads sample rate, channels and sample count', () => {
    const pcm = parseWav(makeWav({ sampleRate: 16000, channels: 1, frames: 16000 }));
    expect(pcm.sampleRate).toBe(16000);
    expect(pcm.channels).toBe(1);
    expect(pcm.samples.length).toBe(16000);
  });

  it('walks chunks rather than assuming data starts at byte 44', () => {
    // The failure this guards is silent: with a hardcoded offset the samples
    // are read from the wrong place and the audio is noise, with no error.
    const withExtra = parseWav(makeWav({ frames: 800, extraChunk: true }));
    const without   = parseWav(makeWav({ frames: 800, extraChunk: false }));
    expect(withExtra.samples.length).toBe(800);
    expect(Array.from(withExtra.samples.slice(0, 8)))
      .toEqual(Array.from(without.samples.slice(0, 8)));
  });

  it('rejects a non-WAV file instead of emitting garbage', () => {
    expect(() => parseWav(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])))
      .toThrow(/Not a WAV/);
  });

  it('rejects unsupported bit depths', () => {
    const w = makeWav({ frames: 100 });
    new DataView(w.buffer).setUint16(34, 24, true);   // claim 24-bit
    expect(() => parseWav(w)).toThrow(/bit depth/);
  });
});

describe('toMono', () => {
  it('passes mono through untouched', () => {
    const pcm = parseWav(makeWav({ channels: 1, frames: 100 }));
    expect(toMono(pcm).samples).toBe(pcm.samples);
  });

  it('averages stereo down to one channel', () => {
    const pcm  = parseWav(makeWav({ channels: 2, frames: 100 }));
    const mono = toMono(pcm);
    expect(mono.channels).toBe(1);
    expect(mono.samples.length).toBe(100);
    // Average of the interleaved pair, not just the left channel.
    expect(mono.samples[0]).toBe(((pcm.samples[0] + pcm.samples[1]) / 2) | 0);
  });
});

describe('durationMs', () => {
  it('computes duration from the samples, not from a UI timer', () => {
    expect(durationMs(parseWav(makeWav({ sampleRate: 16000, frames: 16000 })))).toBe(1000);
    expect(durationMs(parseWav(makeWav({ sampleRate: 16000, frames: 48000 })))).toBe(3000);
  });

  it('accounts for channels', () => {
    const stereo = parseWav(makeWav({ sampleRate: 16000, channels: 2, frames: 16000 }));
    expect(durationMs(stereo)).toBe(1000);
  });
});

describe('encodeMp3', () => {
  it('produces a valid MP3 frame header', async () => {
    const out = await encodeMp3(parseWav(makeWav({ frames: 16000 })));
    expect(out.length).toBeGreaterThan(0);
    // MP3 frame sync: 11 set bits.
    expect(out[0]).toBe(0xff);
    expect(out[1] & 0xe0).toBe(0xe0);
  });

  it('compresses substantially versus the PCM it came from', async () => {
    // The whole reason this module exists. 16kHz 16-bit mono is 32 KB/s; at
    // 32 kbps the MP3 is ~4 KB/s. If this ratio collapses, uploads and egress
    // regress 8x and nothing else in the app will complain.
    const wav = makeWav({ frames: 16000 * 5 });      // 5 seconds
    const mp3 = await encodeMp3(parseWav(wav));
    expect(mp3.length).toBeLessThan(wav.length / 4);
  });

  it('reports progress and finishes at 1', async () => {
    const seen: number[] = [];
    await encodeMp3(parseWav(makeWav({ frames: 16000 * 8 })), (p) => seen.push(p));
    expect(seen.length).toBeGreaterThan(1);          // it yielded, not one jump
    expect(seen[seen.length - 1]).toBe(1);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...seen)).toBeLessThanOrEqual(1);
  });

  it('encodes a full 3-minute recording', async () => {
    // The cap. Proves the chunking loop terminates and the output is plausible
    // at the size the product actually allows.
    const pcm = parseWav(makeWav({ frames: 16000 * 180 }));
    const mp3 = await encodeMp3(pcm);
    const expected = (MP3_BITRATE_KBPS * 1000 / 8) * 180;   // ~720 KB
    expect(mp3.length).toBeGreaterThan(expected * 0.5);
    expect(mp3.length).toBeLessThan(expected * 1.5);
  }, 60_000);
});
