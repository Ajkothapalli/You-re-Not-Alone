/**
 * Where a toast actually appears.
 *
 * Reported from a device on 2026-10-02: "Copy link does not work." It did
 * work — the link reached the clipboard every time. What failed was the
 * only thing that said so.
 *
 * `emit` was a single module-level slot and the one ToastHost lived in the
 * root layout. A Modal is a separate native WINDOW drawn above the app, so
 * a toast raised from inside the share sheet rendered behind it: fired,
 * animated, invisible. From the outside that is indistinguishable from a
 * button that does nothing.
 *
 * The fix is a stack of hosts, and the half that is easy to get wrong is
 * the unmount: with one slot, the modal's host overwrote the root's and
 * then nulled it on close, so after opening the sheet ONCE toasts stopped
 * appearing anywhere for the rest of the session. That is the regression
 * most of this file is about.
 */

import React from 'react';
import { render, act } from '@testing-library/react-native';
import { ToastHost, showToast } from '@/components/Toast';
import { ThemeProvider } from '@/theme/ThemeProvider';

function host() {
  return render(
    <ThemeProvider>
      <ToastHost />
    </ThemeProvider>,
  );
}

/**
 * Both hosts in ONE tree — the root layout's and the share sheet's.
 *
 * Rendered together rather than as two separate renderers so the assertion
 * can be the real property: how MANY hosts put the message on screen. Two
 * would mean two toasts in the one window a person is looking at.
 */
function Stacked({ sheet }: { sheet: boolean }) {
  return (
    <ThemeProvider>
      <ToastHost />
      {sheet && <ToastHost />}
    </ThemeProvider>
  );
}

describe('a toast reaches the screen', () => {
  it('shows the message it was given', async () => {
    const u = await host();
    await act(async () => { showToast('Link copied'); });
    expect(u.getByText('Link copied')).toBeTruthy();
  });

  it('nothing is drawn before anything is raised', async () => {
    const u = await host();
    expect(u.queryByText('Link copied')).toBeNull();
  });
});

describe('a host inside a modal does not disable the one behind it', () => {
  it('exactly one host shows it, not both', async () => {
    const u = await render(<Stacked sheet />);
    await act(async () => { showToast('Link copied'); });
    expect(u.getAllByText('Link copied')).toHaveLength(1);
  });

  it('closing it hands toasts BACK, rather than ending them', async () => {
    /**
     * The actual regression a single slot caused: open the share sheet
     * once, close it, and no toast appears anywhere again — not on a
     * report, not on a failed save, nowhere — until the app restarts.
     */
    const u = await render(<Stacked sheet />);
    // Inside act: a bare rerender does not flush the unmount effect, so the
    // closing host would still be on the stack when the toast is raised.
    await act(async () => { u.rerender(<Stacked sheet={false} />); });

    await act(async () => { showToast('Reported'); });
    expect(u.getAllByText('Reported')).toHaveLength(1);
  });

  it('survives the sheet being opened and closed repeatedly', async () => {
    const u = await render(<Stacked sheet={false} />);
    for (let i = 0; i < 3; i++) {
      await act(async () => { u.rerender(<Stacked sheet />); });
      await act(async () => { u.rerender(<Stacked sheet={false} />); });
    }
    await act(async () => { showToast('Still here'); });
    expect(u.getAllByText('Still here')).toHaveLength(1);
  });

  it('raising one with no host at all does not throw', async () => {
    // Early boot, or after the last host unmounts.
    expect(() => showToast('Nobody is listening')).not.toThrow();
  });
});

describe('the share sheet carries its own host', () => {
  it('mounts one inside the Modal', () => {
    // Source-level: the bug is a WINDOW boundary, which a render test in
    // one tree cannot see.
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(
      path.join(__dirname, '..', '..', 'components', 'share', 'ShareComposer.tsx'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

    expect(src).toMatch(/<ToastHost \/>/);
    // Inside the Modal, or it is the root host all over again.
    expect(src.indexOf('<ToastHost />')).toBeGreaterThan(src.indexOf('<Modal'));
  });
});
