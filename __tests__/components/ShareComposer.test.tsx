/**
 * The share composer, and the way out of it.
 *
 * Reported from a device on 2026-10-02: the close button did nothing, and
 * it was drawn inside the status bar.
 *
 * Both came from the same line. The composer was an opaque FULL-SCREEN
 * Modal whose header carried a bare `paddingTop: 12`, and the top inset on
 * a Dynamic Island phone is about 59 — so the only control that dismissed
 * the screen sat under the system's own bar, half hidden and not reachable,
 * because the OS owns touches up there. On iOS there is no hardware back
 * button either, so the composer was a dead end.
 *
 * There was no render test for this component at all, which is why a
 * screen nobody could leave passed a green suite.
 *
 * It is a bottom sheet now. These tests pin the two things that were
 * broken — a working dismissal, and chrome that cannot collide with the
 * status bar — rather than the decoration around them.
 */

import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ShareComposer from '@/components/share/ShareComposer';
import { ThemeProvider } from '@/theme/ThemeProvider';

const ROOT = path.join(__dirname, '..', '..');
const SRC  = fs.readFileSync(
  path.join(ROOT, 'components', 'share', 'ShareComposer.tsx'), 'utf8');
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

function draw(over: Partial<React.ComponentProps<typeof ShareComposer>> = {}) {
  return render(
    <ThemeProvider>
      <ShareComposer
        visible
        onClose={jest.fn()}
        source="read"
        text="I never told anyone how much that night changed me."
        category="grief"
        feltCount={217}
        onRelease={jest.fn()}
        {...over}
      />
    </ThemeProvider>,
  );
}

describe('a reader can always get out', () => {
  it('the close button closes it', async () => {
    const onClose = jest.fn();
    const u = await draw({ onClose });
    fireEvent.press(u.getByTestId('share-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the close button is reachable by its label, not just its testID', async () => {
    const onClose = jest.fn();
    const u = await draw({ onClose });
    fireEvent.press(u.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('tapping the backdrop closes it too', async () => {
    // A sheet that could only be dismissed by one small control would be
    // the same bug with a smaller blast radius.
    const onClose = jest.fn();
    const u = await draw({ onClose });
    // includeHiddenElements because the backdrop is deliberately hidden
    // from screen readers — see the next test. It is still tappable.
    fireEvent.press(u.getByTestId('share-backdrop', { includeHiddenElements: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the backdrop is not announced as a giant button', async () => {
    // The header has a real Close; a full-screen one is noise for a screen
    // reader, not a second affordance.
    const u = await draw();
    const backdrop = u.getByTestId('share-backdrop', { includeHiddenElements: true });
    expect(backdrop.props.accessibilityElementsHidden).toBe(true);
    expect(backdrop.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});

describe('nothing is drawn under the status bar', () => {
  it('is a sheet: transparent, sliding up from the bottom', async () => {
    // The structural fix. A sheet starts below the status bar by
    // construction, so no inset arithmetic can be wrong about it.
    // `transparent` as a bare prop. /transparent\b/ alone also matched
    // `transparent={false}`, so reverting the sheet to the opaque
    // full-screen Modal passed this test — the mutation it exists to catch.
    expect(code).toMatch(/^\s*transparent\s*$/m);
    expect(code).not.toMatch(/transparent=\{false\}/);
    expect(code).toMatch(/animationType="slide"/);
    expect(code).toMatch(/justifyContent: 'flex-end'/);
  });

  it('the header no longer guesses a top offset', () => {
    // `paddingTop: 12` against a ~59pt Dynamic Island inset is what put the
    // close button under the clock.
    const header = code.slice(code.indexOf('header:   {'));
    const pad = /paddingTop:\s*(\d+)/.exec(header.slice(0, 200));
    expect(pad).not.toBeNull();
    expect(Number(pad![1])).toBeLessThanOrEqual(8);
  });

  it('the bottom comes from the device, not from a number', () => {
    // The home indicator varies by device the same way the top inset does.
    expect(code).toMatch(/useSafeAreaInsets/);
    expect(code).toMatch(/insets\.bottom/);
  });

  it('is capped so there is visibly a screen behind it', async () => {
    expect(code).toMatch(/maxHeight:\s*'9\d%'/);
  });
});

describe('the sheet cannot hide its own controls', () => {
  it('Share and Copy link are outside the scrolling area', () => {
    /**
     * The preview alone is 480pt. On a small phone the card plus the
     * picker is taller than the sheet, so if the actions scrolled with
     * them the Share button would be below the fold — a sheet that clips
     * the button it exists for is the first bug again.
     */
    const body    = code.indexOf('<ScrollView');
    const endBody = code.indexOf('</ScrollView>');
    const actions = code.indexOf('styles.actions');
    expect(body).toBeGreaterThan(-1);
    expect(actions).toBeGreaterThan(endBody);
  });

  it('both actions render', async () => {
    const u = await draw();
    expect(u.getByText('Share')).toBeTruthy();
    expect(u.getByText('Copy link')).toBeTruthy();
  });

  it('the content scrolls rather than clipping', () => {
    expect(code).toMatch(/<ScrollView/);
  });
});

describe('what must not be swallowed by the sheet', () => {
  it('the capture target stays out of it', () => {
    // A node inside a clipping, scrolling sheet does not rasterise to the
    // card somebody is about to send.
    const sheet     = code.indexOf('styles.sheet');
    const offscreen = code.indexOf('styles.offscreen');
    expect(offscreen).toBeLessThan(sheet);
  });

  it('the release animation plays over the whole screen', () => {
    // ShareRelease is sized to the screen and rendered on absoluteFill;
    // inside the sheet it would be cropped to it.
    const sheetEnd = code.lastIndexOf('</View>\n\n        {/*');
    const release  = code.indexOf('<ShareRelease');
    expect(release).toBeGreaterThan(sheetEnd);
  });
});
