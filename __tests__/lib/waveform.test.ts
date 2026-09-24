/**
 * The waveform: capture maths, and what the new column is allowed to expose.
 *
 * The visual half is easy to eyeball and hard to regress. The two things that
 * are NOT are (a) the downsample, where the obvious implementation makes every
 * confession draw the same shape, and (b) rebuilding confessions_public, where
 * a single stray column in a SELECT undoes invariant 3.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  normaliseLevel, downsampleLevels, WAVEFORM_BARS,
} from '@/lib/voiceRecorder';

const ROOT = path.join(__dirname, '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

// ─── normaliseLevel ───────────────────────────────────────────────────────────

describe('normaliseLevel', () => {
  it('maps the recogniser range onto 0..1', () => {
    expect(normaliseLevel(0)).toBe(0);
    expect(normaliseLevel(5)).toBeCloseTo(0.5, 5);
    expect(normaliseLevel(10)).toBe(1);
  });

  it('clamps below zero — the recogniser calls that inaudible, not negative', () => {
    expect(normaliseLevel(-2)).toBe(0);
    expect(normaliseLevel(-0.5)).toBe(0);
  });

  it('clamps above the documented ceiling rather than drawing off the top', () => {
    expect(normaliseLevel(50)).toBe(1);
  });

  it('survives the values a native bridge can actually hand over', () => {
    for (const bad of [NaN, Infinity, -Infinity, undefined as never, null as never]) {
      expect(normaliseLevel(bad as number)).toBe(0);
    }
  });
});

// ─── downsampleLevels ─────────────────────────────────────────────────────────

describe('downsampleLevels', () => {
  it('always returns exactly WAVEFORM_BARS buckets', () => {
    for (const n of [1, 7, 48, 49, 1800]) {
      expect(downsampleLevels(Array(n).fill(0.5))).toHaveLength(WAVEFORM_BARS);
    }
  });

  it('returns nothing for an empty capture rather than a row of zeros', () => {
    // A device that reported no levels must be distinguishable from silence,
    // so the card can omit the strip instead of drawing a flat line.
    expect(downsampleLevels([])).toEqual([]);
  });

  it('emits 0..100 integers, which is what smallint[] stores', () => {
    const out = downsampleLevels([0, 0.333, 1, 0.5]);
    for (const v of out) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('takes the PEAK of each bucket, not the mean', () => {
    // This is the whole reason the function exists. Averaging three minutes
    // into 48 buckets pulls everything toward the middle and every confession
    // ends up drawing the same shape. One loud moment in a quiet stretch has
    // to survive.
    const mostlyQuiet = Array(1000).fill(0);
    mostlyQuiet[10] = 1;                       // a single shout near the start
    const out = downsampleLevels(mostlyQuiet);

    expect(Math.max(...out)).toBe(100);        // the peak survived
    const mean = (mostlyQuiet.reduce((a, b) => a + b, 0) / mostlyQuiet.length) * 100;
    expect(mean).toBeLessThan(1);              // a mean would have erased it
  });

  it('keeps loud and quiet stretches in the right order', () => {
    const levels = [...Array(500).fill(0.1), ...Array(500).fill(0.9)];
    const out = downsampleLevels(levels);
    const firstHalf = out.slice(0, WAVEFORM_BARS / 2);
    const lastHalf  = out.slice(WAVEFORM_BARS / 2);
    expect(Math.max(...firstHalf)).toBeLessThan(Math.min(...lastHalf));
  });

  it('does not stretch a capture shorter than the bar count', () => {
    // Three samples must not become 48 bars of invented detail.
    const out = downsampleLevels([1, 0, 1]);
    expect(out).toHaveLength(WAVEFORM_BARS);
    expect(new Set(out).size).toBeLessThanOrEqual(3);
  });
});

// ─── What the new column may expose (CLAUDE.md invariant 3) ──────────────────

describe('the waveform migration does not widen the public view', () => {
  const sql = read('supabase', 'migrations', '20260924000001_audio_waveform.sql');

  it('rebuilds confessions_public without account_id, author_token or source', () => {
    const view = sql.slice(sql.indexOf('CREATE OR REPLACE VIEW'));
    const select = view.slice(0, view.indexOf('FROM'));
    for (const forbidden of ['account_id', 'author_token', 'source', 'audio_key', 'embedding']) {
      expect(select).not.toContain(forbidden);
    }
  });

  it('still restricts the view to live and approved rows', () => {
    expect(sql).toMatch(/WHERE\s+status IN \('live', 'approved'\)/);
  });

  it('bounds the array so a client cannot post an unbounded one', () => {
    expect(sql).toMatch(/CHECK/);
    expect(sql).toMatch(/array_length\(audio_waveform, 1\) BETWEEN 1 AND 64/);
  });
});

describe('the feed RPC exposes the waveform and nothing else new', () => {
  const sql = read('supabase', 'migrations', '20260924000002_feed_audio_waveform.sql');

  it('adds audio_waveform to the returned columns', () => {
    expect(sql).toContain('audio_waveform    smallint[]');
    expect(sql).toMatch(/c\.audio_waveform/);
  });

  it('never selects audio_key', () => {
    expect(sql).not.toMatch(/c\.audio_key/);
  });

  it('keeps every safety filter from the migration it replaces', () => {
    for (const clause of [
      "c.status IN ('live', 'approved')",
      'c.author_token <> p_author_token',
      'c.author_token NOT IN (SELECT token FROM banned_tokens)',
      'c.categories && p_categories',
    ]) expect(sql).toContain(clause);
  });
});

// ─── The server sanitises what the client sends ──────────────────────────────

describe('create-audio-upload does not trust the posted waveform', () => {
  const src = read('supabase', 'functions', 'create-audio-upload', 'index.ts');

  it('clamps, rounds and caps the length before it reaches the column', () => {
    expect(src).toMatch(/slice\(0, 64\)/);
    expect(src).toMatch(/Math\.max\(0, Math\.min\(100, Math\.round/);
    expect(src).toMatch(/Number\.isFinite/);
  });

  it('omits the column entirely when nothing usable came through', () => {
    // Writing [] would be indistinguishable from "this device reports levels
    // but the writer was silent", and the card would draw an empty strip.
    expect(src).toMatch(/waveform\.length > 0 \? \{ audio_waveform: waveform \} : \{\}/);
  });
});
