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
    // finishShare is no longer async: it hands the prepared capture up to
    // ShareFlow, which closes the Modal before presenting the sheet.
    expect(c).toMatch(/if \(reduced\) \{ finishShare\(\); return; \}/);
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
  it('the flow gates it on choseTarget', () => {
    // Moved out of the composer: the sheet is now presented by ShareFlow,
    // AFTER the Modal has closed, because launching the Android chooser from
    // behind a React Native Modal leaves it stuck behind that window.
    expect(code(flow)).toMatch(/if \(result\.choseTarget\)/);
  });

  it('the composer never presents the sheet itself', () => {
    expect(code(composer)).not.toContain('openShareSheet');
  });

  it('the modal is closed before the sheet opens', () => {
    const c = code(flow);
    expect(c).toMatch(/visible=\{visible && !after && !presenting\}/);
    expect(c).toMatch(/setTimeout/);
  });

  it('the flow shows it only when the composer says so', () => {
    const c = code(flow);
    // The composer hands the prepared capture up; the flow decides.
    expect(c).toMatch(/onRelease=\{handleRelease\}/);
    expect(c).toMatch(/setAfter\(true\)/);
    // There is exactly one place that turns it on, and it sits inside the
    // choseTarget branch.
    expect((c.match(/setAfter\(true\)/g) ?? []).length).toBe(1);
    const branch = c.slice(c.indexOf('if (result.choseTarget)'));
    expect(branch.slice(0, branch.indexOf('return;'))).toContain('setAfter(true)');
  });

  it('a dismissed chooser reaches no celebration', () => {
    // No else-branch that also fires onShared.
    expect(code(flow)).not.toMatch(/else\s*\{[^}]*onShared/);
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

describe('the capture starts before the animation, and finishes before the modal closes', () => {
  it('prepareShare is kicked off on tap, not awaited there', () => {
    const c = code(composer);
    const share = c.slice(c.indexOf('async function handleShare'), c.indexOf('async function finishShare'));
    expect(share).toContain('prepareShare(captureRef, source)');
    // Awaiting it here would serialise it with the animation and hand the
    // reader a 2.6s wait followed by a capture.
    expect(share).not.toMatch(/await prepareShare/);
  });

  it('the composer awaits its OWN capture, while the card is still mounted', () => {
    /**
     * THE grey-screen bug, pinned.
     *
     * This used to hand the in-flight promise to ShareFlow, which hid the
     * Modal and awaited it afterwards — so captureRef ran against a view
     * that had already unmounted. On Android that does not reliably throw;
     * it can simply never settle, and then setPresenting(null) is never
     * reached, the composer stays hidden, the after screen never opens,
     * and the reader is stuck on a torn-down Modal.
     *
     * The previous version of this test asserted the buggy line
     * (`await presenting.prepared`) and so held it in place.
     */
    const c = code(composer);
    const finish = c.slice(c.indexOf('async function finishShare'), c.indexOf('async function handleCopy'));
    expect(finish).toMatch(/await withTimeout\(p,/);
    expect(finish).toMatch(/onRelease\(resolved,/);
    // And it is bounded, so a hung capture cannot hold the overlay open.
    expect(c).toMatch(/PREPARE_TIMEOUT_MS/);
  });

  it('ShareFlow receives a RESOLVED capture and never awaits one', () => {
    const f = code(flow);
    expect(f).toMatch(/prepared: PreparedShare;/);
    expect(f).not.toMatch(/await presenting\.prepared/);
    expect(f).toMatch(/openShareSheet\(presenting\.prepared\)/);
  });

  it('nothing can leave the reader on a blank screen forever', () => {
    // A watchdog, because this screen has got stuck twice. The share may
    // be lost; the way forward never is.
    const f = code(flow);
    expect(f).toMatch(/STUCK_AFTER_MS/);
    expect(f).toMatch(/setTimeout\(\(\) => setPresenting\(null\), STUCK_AFTER_MS\)/);
  });

  it('the composer is hidden before the chooser is launched', () => {
    // On Android the chooser is an Activity; launched while a React Native
    // Modal is mounted it appears BEHIND it.
    const f = code(flow);
    expect(f).toMatch(/visible=\{visible && !after && !presenting\}/);
    expect(f).toMatch(/setTimeout\(r, 250\)/);
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

describe('a confession in the feed can actually be shared', () => {
  /**
   * How it went missing, so it does not go missing the same way twice.
   *
   * The per-card share control lived on the S2 deck card. When the deck was
   * removed the control went with it, and the list card had never had one —
   * leaving a single nudge that appears ONCE a session and only above 50
   * felts. Nothing failed: ReadCard's own tests only prove it CAN draw a
   * share button when handed a handler, and the feed quietly stopped
   * handing it one.
   *
   * So the guard is on the WIRING, which is the half that was missing.
   */
  const explore  = code(read('app', '(tabs)', 'explore.tsx'));
  const readCard = code(read('components', 'ReadCard.tsx'));

  it('the feed hands every card a share handler', () => {
    const card = explore.slice(explore.indexOf('<ReadCard'));
    expect(card.slice(0, card.indexOf('/>'))).toMatch(/onShare=\{onCardShare\}/);
  });

  it('the card draws a control for it', () => {
    expect(readCard).toMatch(/accessibilityLabel="Share this confession"/);
    expect(readCard).toMatch(/<Icon name="share"/);
  });

  it('the handler is stable, or ReadCard stops being memoized', () => {
    // A fresh arrow per render changes every card's props on every render.
    expect(explore).toMatch(/const onCardShare = useCallback\(/);
  });

  it('it opens the composer rather than firing a share sheet directly', () => {
    // The reader chooses how the quotation looks before anything leaves.
    const fn = explore.slice(explore.indexOf('const onCardShare'));
    const body = fn.slice(0, fn.indexOf('}, ['));
    expect(body).toMatch(/setComposerOpen\(true\)/);
    expect(body).not.toMatch(/shareConfessionCard|Share\.share/);
  });
});

describe('the release animation runs on the UI thread', () => {
  /**
   * Reported from a device on 2026-10-02: tapping Share threw
   * "[Worklets] Tried to synchronously call a non-worklet function `px` on
   * the UI thread", and the release animation took the share with it.
   *
   * `px` is an ordinary design-space conversion in lib/shareLooks.ts, and
   * it was being called from inside useAnimatedStyle. Under the worklets
   * runtime that is a hard throw, not a slow path.
   *
   * Its inputs are CONSTANT for the life of the animation, so the fix is
   * to convert once per render and close over plain numbers — which is
   * also less work than converting on every frame.
   */
  const release = code(read('components', 'share', 'ShareRelease.tsx'));

  function workletBodies(src: string): string[] {
    const out: string[] = [];
    for (const m of src.matchAll(/useAnimatedStyle\(\(\)\s*=>\s*/g)) {
      let depth = 0, j = m.index! + m[0].length;
      const start = j;
      for (; j < src.length; j++) {
        if ('({['.includes(src[j])) depth++;
        else if (')}]'.includes(src[j]) && --depth <= 0) break;
      }
      out.push(src.slice(start, j));
    }
    return out;
  }

  it('no animated style calls px', () => {
    for (const body of workletBodies(release)) {
      expect(body).not.toMatch(/\bpx\s*\(/);
    }
  });

  it('the conversions happen outside, on plain numbers', () => {
    // Hoisted into the hook body, where the JS thread can run them.
    expect(release).toMatch(/const sx = px\(start\.x\)/);
    const hook = release.indexOf('const sx = px(start.x)');
    const style = release.indexOf('useAnimatedStyle', hook);
    expect(hook).toBeLessThan(style);
  });

  it('nothing else in the share card reaches a JS helper from a worklet', () => {
    // The whole family, since they share lib/shareLooks.
    for (const f of ['QuotedCard.tsx', 'ShareRelease.tsx', 'ShareComposer.tsx']) {
      const src = code(read('components', 'share', f));
      for (const body of workletBodies(src)) {
        for (const helper of [/\bpx\s*\(/, /\bbackgroundFor\s*\(/, /\bcategoryLabel\s*\(/,
                              /\btextMultiplier\s*\(/, /\bsnippetFor\s*\(/, /\bmixToWhite\s*\(/]) {
          expect([f, helper.source, helper.test(body)]).toEqual([f, helper.source, false]);
        }
      }
    }
  });
});
