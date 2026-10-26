/**
 * [N1] The pre-permission card.
 *
 * The copy here is owner-supplied and fixed (§4d), so most of this suite is
 * about the words being exactly right — not approximately right. A softened
 * promise line or a decline that argues back are both the kind of change
 * that looks like an improvement in a diff and is a dark pattern on a
 * screen.
 *
 * The rest is about the sequence: the landing beat, then the dialog, then
 * the outcome. Getting that order wrong means somebody sees the OS prompt
 * before they have read what it is for, which is the one thing this card
 * exists to prevent.
 */

jest.mock('@/lib/a11y', () => ({
  announce:         jest.fn(),
  useReducedMotion: jest.fn(() => false),
}));

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import PushAskCard, { COPY, PROMISE, TOAST_GRANTED, TOAST_DENIED } from '@/components/PushAskCard';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { announce, useReducedMotion } from '@/lib/a11y';
import type { AskMoment } from '@/lib/pushAsk';

const MOMENTS: AskMoment[] = ['proof', 'just_posted', 'question'];

function card(moment: AskMoment, over: Partial<React.ComponentProps<typeof PushAskCard>> = {}) {
  return render(
    <ThemeProvider>
      <PushAskCard
        moment={moment}
        onAccept={over.onAccept ?? jest.fn()}
        onDecline={over.onDecline ?? jest.fn()}
        collapsed={over.collapsed}
      />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (useReducedMotion as jest.Mock).mockReturnValue(false);
});

// ─── The copy, verbatim ──────────────────────────────────────────────────────

describe('each moment shows its own words', () => {
  it.each(MOMENTS)('%s renders the exact copy', async (moment) => {
    const u = await card(moment);
    const c = COPY[moment];
    expect(u.getByText(c.eyebrow)).toBeTruthy();
    expect(u.getByText(c.headline)).toBeTruthy();
    expect(u.getByText(c.body)).toBeTruthy();
    expect(u.getByLabelText(c.primary)).toBeTruthy();
    expect(u.getByLabelText(c.decline)).toBeTruthy();
  });

  it.each(MOMENTS)('%s matches its snapshot', async (moment) => {
    // Pinned so a rewrite of owner-supplied copy shows up as a diff rather
    // than shipping.
    const u = await card(moment);
    expect(u.toJSON()).toMatchSnapshot(`push-ask-${moment}`);
  });

  it.each(MOMENTS)('%s carries the promise line', async (moment) => {
    /**
     * The only place a person is told what will NOT happen. "Never your
     * words themselves" is what makes the rest of it safe to agree to, and
     * a card without it is asking for something different from what the
     * owner approved.
     */
    const u = await card(moment);
    expect(u.getByText(PROMISE)).toBeTruthy();
  });

  it('the three headlines are all different', async () => {
    // Each moment is answering a different question the person just had.
    const heads = MOMENTS.map((m) => COPY[m].headline);
    expect(new Set(heads).size).toBe(3);
  });
});

// ─── Accepting ───────────────────────────────────────────────────────────────

describe('tapping the primary button', () => {
  it('plays the landing beat BEFORE the dialog', async () => {
    /**
     * The sequence is the point: the note lands, then the OS asks. Calling
     * onAccept on the tap itself would put the system dialog over a card
     * that is still animating, which is the jarring version of exactly the
     * thing this is trying to do gently.
     */
    const onAccept = jest.fn();
    const u = await card('proof', { onAccept });

    await act(async () => { fireEvent.press(u.getByLabelText(COPY.proof.primary)); });
    // Not yet — Arrival calls back when the beat finishes.
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('asks once, however many times it is tapped', async () => {
    const onAccept = jest.fn();
    const u = await card('proof', { onAccept });
    const btn = u.getByLabelText(COPY.proof.primary);
    await act(async () => {
      fireEvent.press(btn); fireEvent.press(btn); fireEvent.press(btn);
    });
    // The dialog can be shown once; a double tap must not queue two.
    expect(onAccept.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('skips the beat entirely with reduce-motion', async () => {
    // Arrival renders the still and reports back immediately, so the
    // dialog is not delayed by an animation that is not playing.
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    const onAccept = jest.fn();
    const u = await card('proof', { onAccept });

    await act(async () => { fireEvent.press(u.getByLabelText(COPY.proof.primary)); });
    expect(onAccept).toHaveBeenCalledTimes(1);
  });
});

// ─── Declining ───────────────────────────────────────────────────────────────

describe('tapping Not now', () => {
  it.each(MOMENTS)('%s reports the decline and nothing else', async (moment) => {
    const onAccept = jest.fn();
    const onDecline = jest.fn();
    const u = await card(moment, { onAccept, onDecline });

    await act(async () => { fireEvent.press(u.getByLabelText(COPY[moment].decline)); });

    expect(onDecline).toHaveBeenCalledTimes(1);
    // The system dialog is never opened by a decline. This is the assertion
    // that would catch somebody "helpfully" asking anyway.
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('does not argue with the answer', async () => {
    // No confirmshaming, no second prompt, no "are you sure". India's CCPA
    // dark-pattern guidance lists that behaviour by name.
    const u = await card('proof', { onDecline: jest.fn() });
    const json = JSON.stringify(u.toJSON());
    for (const forbidden of [/are you sure/i, /don'?t miss/i, /you'?ll regret/i, /instead/i]) {
      expect(json).not.toMatch(forbidden);
    }
  });
});

// ─── The toasts ──────────────────────────────────────────────────────────────

describe('the outcome copy', () => {
  it('is exactly the owner-supplied text', () => {
    expect(TOAST_GRANTED).toBe('Done. We’ll only knock when it matters.');
    expect(TOAST_DENIED).toBe('Okay. You can turn it on anytime in You → Notifications.');
  });

  it('the denial carries no guilt and points somewhere useful', () => {
    expect(TOAST_DENIED).toMatch(/You can turn it on anytime/);
    for (const forbidden of [/sure\?/i, /miss/i, /sorry/i, /unfortunately/i]) {
      expect(TOAST_DENIED).not.toMatch(forbidden);
    }
  });

  it('neither promises speed', () => {
    // Pushes are batched, capped and deferred past quiet hours.
    for (const t of [TOAST_GRANTED, TOAST_DENIED]) {
      for (const forbidden of [/instant/i, /immediat/i, /the moment/i, /right away/i]) {
        expect(t).not.toMatch(forbidden);
      }
    }
  });
});

// ─── Accessibility ───────────────────────────────────────────────────────────

describe('accessibility', () => {
  it('announces itself', async () => {
    // A card that appears mid-screen is invisible to somebody not looking
    // at that part of it.
    await card('proof');
    expect(announce).toHaveBeenCalledWith(
      expect.stringContaining(COPY.proof.headline));
  });

  it('hides the illustration from screen readers', async () => {
    // Decorative. A described drawing is noise in front of the words that
    // matter.
    const u = await card('proof');
    const wrap = u.getByTestId('push-ask-illustration').parent;
    expect(JSON.stringify(u.toJSON())).toMatch(/accessibilityElementsHidden/);
    expect(wrap).toBeTruthy();
  });

  it('labels both buttons', async () => {
    const u = await card('question');
    expect(u.getByLabelText(COPY.question.primary).props.accessibilityRole).toBe('button');
    expect(u.getByLabelText(COPY.question.decline).props.accessibilityRole).toBe('button');
  });

  it('the headline is a header', async () => {
    const u = await card('proof');
    expect(u.getByText(COPY.proof.headline).props.accessibilityRole).toBe('header');
  });
});

// ─── Collapsing ──────────────────────────────────────────────────────────────

describe('collapsing', () => {
  it('renders nothing once collapsed', async () => {
    const u = await card('proof', { collapsed: true });
    expect(u.queryByTestId('push-ask-proof')).toBeNull();
    expect(u.queryByText(COPY.proof.headline)).toBeNull();
  });
});
