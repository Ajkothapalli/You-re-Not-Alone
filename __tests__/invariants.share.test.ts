/**
 * Q1 invariants: reduced motion, the crisis path, and the analytics payloads.
 *
 * Source-level where the property is structural (what a file may import, what
 * a payload may contain), because these are the rules that are invisible in a
 * diff and catastrophic when broken.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

const composer = read('components', 'share', 'ShareComposer.tsx');
const release  = read('components', 'share', 'ShareRelease.tsx');
const after    = read('components', 'share', 'ShareAfter.tsx');
const flow     = read('components', 'share', 'ShareFlow.tsx');
const crisis   = read('app', 'crisis.tsx');

describe('reduced motion is honoured everywhere that moves', () => {
  it('the composer gates its idle drift and its morph', () => {
    const c = code(composer);
    expect(c).toContain('useReducedMotion');
    // The drift loop must not start at all.
    expect(c).toMatch(/if \(!visible \|\| reduced\)/);
    // The look change swaps instantly instead of springing.
    expect(c).toMatch(/if \(reduced\) return;/);
  });

  it('the release animation is skipped entirely, not just shortened', () => {
    // Reduced motion must open the sheet directly — a 2.6s animation played
    // "gently" is still 2.6s of motion someone asked not to see.
    const c = code(composer);
    expect(c).toMatch(/if \(reduced\) \{ await finishShare\(\); return; \}/);
    // …and the release only mounts on the non-reduced path.
    expect(c).toMatch(/setReleasing\(true\)/);
  });

  it('the after screen starts at its final layout', () => {
    const c = code(after);
    expect(c).toContain('useReducedMotion');
    // Every animated value starts settled.
    for (const v of ['descend', 'part', 'fade', 'marker']) {
      expect(c).toMatch(new RegExp(`${v}\\s*=\\s*useSharedValue\\(reduced \\? 1 : 0\\)`));
    }
    // The heading is fully typed rather than animating letter by letter.
    expect(c).toMatch(/useState\(reduced \? heading\.length : 0\)/);
    expect(c).toMatch(/if \(reduced\) \{ setTyped\(heading\.length\); return; \}/);
  });
});

describe('the release never strands a share', () => {
  const c = code(release);

  it('fires its completion exactly once', () => {
    expect(c).toContain('fired');
    expect(c).toMatch(/if \(fired\.current\) return;/);
  });

  it('can be skipped by tapping', () => {
    expect(c).toMatch(/onPress=\{finish\}/);
  });

  it('has a safety net if the animation callback is ever dropped', () => {
    // The sheet opening must not depend on an animation completing.
    expect(c).toMatch(/setTimeout\(finish/);
  });

  it('cleans up its timers and animations', () => {
    expect(c).toContain('clearTimeout');
    expect(c).toContain('cancelAnimation');
  });
});

describe('the after screen only plays on a real share', () => {
  it('the composer gates it on choseTarget', () => {
    expect(code(composer)).toMatch(/if \(result\.choseTarget\)/);
  });

  it('the flow shows it only when the composer says so', () => {
    const c = code(flow);
    expect(c).toMatch(/onShared=\{handleShared\}/);
    expect(c).toMatch(/setAfter\(true\)/);
    // There is exactly one place that turns it on.
    expect((c.match(/setAfter\(true\)/g) ?? []).length).toBe(1);
  });

  it('a dismissed chooser reaches no celebration', () => {
    // No else-branch that also fires onShared.
    expect(code(composer)).not.toMatch(/else\s*\{[^}]*onShared/);
  });
});

describe('nothing from this phase reaches the crisis path', () => {
  it.each([
    'ShareFlow', 'ShareComposer', 'ShareAfter', 'ShareRelease', 'QuotedCard',
    'shareConfessionCard', 'prepareShare', 'openShareSheet', 'shareLooks',
  ])('crisis.tsx does not reference %s', (forbidden) => {
    expect(crisis).not.toContain(forbidden);
  });

  it('crisis.tsx still offers no share affordance at all', () => {
    expect(crisis).not.toContain('Share');
    expect(crisis).not.toContain('cardShared');
  });
});

describe('analytics carry labels and buckets, never content', () => {
  const analytics = read('lib', 'analytics.ts');

  it('declares every Q1 event', () => {
    for (const e of [
      'share_composer_opened', 'share_look_changed', 'share_sheet_opened',
      'share_target_chosen', 'share_after_shown', 'share_after_say_yours_tapped',
      'write_started',
    ]) expect(analytics).toContain(e);
  });

  it('no Q1 payload declares a text, id or token field', () => {
    const start = analytics.indexOf("'share_composer_opened'");
    const end   = analytics.indexOf("'write_started'") + 60;
    // Comments stripped: the block that follows is W2's, whose comment
    // explains that it never carries the question TEXT — and an unstripped
    // search matches that explanation rather than any declared field.
    const block = analytics.slice(start, end)
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    expect(block).not.toMatch(/\btext\b|confession_id|\btoken\b|account_id|transcript/);
    // What they DO carry.
    expect(block).toMatch(/source:\s*string/);
    expect(block).toMatch(/look:\s*string/);
    expect(block).toMatch(/words_included:\s*boolean/);
  });

  it('the share components pass no confession text to analytics', () => {
    for (const src of [composer, after, flow]) {
      const calls = code(src).match(/analytics\.\w+\([^)]*\)/g) ?? [];
      for (const call of calls) {
        expect(call).not.toMatch(/\btext\b/);
      }
    }
  });
});

describe('the capture target is the full-size card', () => {
  it('the composer captures an unscaled copy, not the preview', () => {
    // captureRef on a scaled node produces a scaled PNG — the card would ship
    // at 810×1440 instead of 1080×1920 and nobody would notice until it shipped.
    const c = code(composer);
    const off = c.slice(c.indexOf('offscreen'), c.indexOf('styles.header'));
    expect(off).toContain('ref={captureRef}');
    expect(off).not.toContain('PREVIEW_SCALE');
    expect(c).toMatch(/offscreen:\{?\s*\{?\s*position: 'absolute', left: -9999/);
  });

  it('the preview is the one that is scaled', () => {
    expect(code(composer)).toMatch(/scale: PREVIEW_SCALE/);
  });
});

describe('the capture starts before the animation, not after it', () => {
  it('prepareShare is called on tap, and awaited only at the end', () => {
    const c = code(composer);
    const share = c.slice(c.indexOf('async function handleShare'), c.indexOf('async function finishShare'));
    expect(share).toContain('prepareShare(captureRef, source)');
    // Not awaited inside handleShare — that would serialise it with the
    // animation and hand the user a 2.6s wait followed by a capture.
    expect(share).not.toMatch(/await prepareShare/);
    expect(c).toMatch(/await prepared\.current/);
  });
});

describe('StoryCard is gone', () => {
  it('the file no longer exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'components', 'StoryCard.tsx'))).toBe(false);
  });

  it('nothing imports it', () => {
    for (const dir of ['app', 'components', 'lib']) {
      const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true })
        .flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name))
          : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []);
      for (const f of walk(path.join(ROOT, dir))) {
        expect(fs.readFileSync(f, 'utf8')).not.toContain("from '@/components/StoryCard'");
      }
    }
  });

  it('ShareSource moved to the module that owns the link rules', () => {
    expect(read('lib', 'shareLink.ts')).toMatch(/export type ShareSource = 'match' \| 'rtue' \| 'read'/);
  });
});
