/**
 * The question in the UI: the card's four states, the write screen with and
 * without a question attached, and what reaches analytics.
 *
 * The state that matters most is the one with too few answers. Sending someone
 * to a list of two is a worse first impression than inviting them to start it,
 * so "Be one of the first to answer." is a deliberate state and not a fallback.
 */

jest.mock('@/lib/deviceHash', () => ({ getDeviceHash: jest.fn().mockResolvedValue('hash') }));
jest.mock('@/lib/readAllowance', () => ({ grantForWrite: jest.fn() }));
jest.mock('@/components/ProfileButton', () => ({ __esModule: true, default: () => null }));
jest.mock('@/lib/a11y', () => ({ useReducedMotion: () => true, announce: jest.fn() }));
jest.mock('@/components/AppDialog', () => ({ showDialog: jest.fn() }));

const mockTrack = jest.fn();
jest.mock('@/lib/analytics', () => ({
  analytics: new Proxy({}, { get: (_t, name: string) => (...a: unknown[]) => mockTrack(name, a) }),
}));

const mockQuestion = jest.fn();
jest.mock('@/lib/question', () => {
  const actual = jest.requireActual('@/lib/question');
  return { ...actual, getCurrentQuestion: () => mockQuestion() };
});

const mockSubmit = jest.fn();
jest.mock('@/lib/api', () => ({
  submitConfession:     (...a: unknown[]) => mockSubmit(...a),
  getReaderPreferences: jest.fn().mockResolvedValue({ categories: ['grief'] }),
  // The REAL predicate, not a stub: it decides whether a submission failure
  // leaves the writer's words in the field or wipes them, and a mock that
  // always said "no" would pass this suite while hiding that.
  isNotGenuine: jest.requireActual('@/lib/api').isNotGenuine,
}));

import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import QuestionCard from '@/components/QuestionCard';
import WriteScreen from '../../app/(tabs)/write';
import { DraftProvider } from '@/lib/draftContext';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { LiveQuestion } from '@/lib/question';

jest.useFakeTimers();

const Q: LiveQuestion = {
  id:   '11111111-2222-3333-4444-555555555555',
  text: 'What’s sitting in your drafts that you’ll never send?',
  startsOn: '2026-10-05',
  answerCount: 12,
};

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockQuestion.mockResolvedValue(Q);
});
afterEach(() => jest.clearAllTimers());

// ─── The card ────────────────────────────────────────────────────────────────

function card(q: LiveQuestion, on: Partial<Record<string, () => void>> = {}) {
  return render(
    <ThemeProvider>
      <QuestionCard
        question={q}
        onAnswer={on.onAnswer ?? jest.fn()}
        onReadAnswers={on.onReadAnswers ?? jest.fn()}
        onShare={on.onShare ?? jest.fn()}
        onDismiss={on.onDismiss ?? jest.fn()}
      />
    </ThemeProvider>,
  );
}

describe('the question card', () => {
  it('shows the question and the primary action', async () => {
    const { getByText } = await card(Q);
    expect(getByText(Q.text)).toBeTruthy();
    expect(getByText('Answer it')).toBeTruthy();
  });

  it('offers reading once there are enough answers', async () => {
    const { getByText, queryByTestId } = await card(Q);
    expect(getByText('Read 12 answers')).toBeTruthy();
    expect(queryByTestId('question-be-first')).toBeNull();
  });

  it('invites instead when there are too few', async () => {
    const { getByTestId, queryByText } = await card({ ...Q, answerCount: null });
    expect(getByTestId('question-be-first')).toBeTruthy();
    expect(queryByText(/^Read /)).toBeNull();
  });

  it.each([null, 0, 1, 2])('withholds reading at answerCount %s', async (n) => {
    const { getByTestId } = await card({ ...Q, answerCount: n });
    expect(getByTestId('question-be-first')).toBeTruthy();
  });

  it('calls back for each action', async () => {
    const onAnswer = jest.fn(), onReadAnswers = jest.fn(), onShare = jest.fn(), onDismiss = jest.fn();
    const { getByText } = await card(Q, { onAnswer, onReadAnswers, onShare, onDismiss });

    await act(async () => { fireEvent.press(getByText('Answer it')); });
    await act(async () => { fireEvent.press(getByText('Read 12 answers')); });
    await act(async () => { fireEvent.press(getByText('Share the question')); });
    await act(async () => { fireEvent.press(getByText('Not now')); });

    expect(onAnswer).toHaveBeenCalled();
    expect(onReadAnswers).toHaveBeenCalled();
    expect(onShare).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });

  it('reports being shown, and the taps, without the question text', async () => {
    const { getByText } = await card(Q);
    await act(async () => { fireEvent.press(getByText('Answer it')); });

    const names = mockTrack.mock.calls.map(([n]) => n);
    expect(names).toContain('questionCardShown');
    expect(names).toContain('questionAnswerTapped');
    expect(JSON.stringify(mockTrack.mock.calls)).not.toContain(Q.text);
  });
});

// ─── The write screen ────────────────────────────────────────────────────────

async function write(params: Record<string, string> = {}) {
  const expoRouter = require('expo-router');
  jest.spyOn(expoRouter, 'useLocalSearchParams').mockReturnValue(params);
  return render(<ThemeProvider><DraftProvider><WriteScreen /></DraftProvider></ThemeProvider>);
}

describe('the write screen while answering', () => {
  it('shows the question when one is attached', async () => {
    const u = await write({ questionId: Q.id });
    await waitFor(() => expect(u.getByTestId('write-question-banner')).toBeTruthy());
    expect(u.getByText(Q.text)).toBeTruthy();
  });

  it('shows nothing when no question is attached', async () => {
    const u = await write({});
    expect(u.queryByTestId('write-question-banner')).toBeNull();
    expect(mockQuestion).not.toHaveBeenCalled();
  });

  it('ignores a stale id — the week may have turned over', async () => {
    const u = await write({ questionId: '99999999-9999-9999-9999-999999999999' });
    await act(async () => { await Promise.resolve(); });
    expect(u.queryByTestId('write-question-banner')).toBeNull();
  });

  it('hides the sentence starters — the question IS the starter', async () => {
    const u = await write({ questionId: Q.id });
    await waitFor(() => expect(u.getByTestId('write-question-banner')).toBeTruthy());
    expect(u.queryByTestId('starter-chips')).toBeNull();
  });

  it('detaching brings the starters back and keeps the words', async () => {
    const u = await write({ questionId: Q.id });
    await waitFor(() => expect(u.getByTestId('write-question-banner')).toBeTruthy());

    await act(async () => {
      fireEvent.changeText(u.getByLabelText('Your confession'), 'half a sentence already');
    });
    await act(async () => { fireEvent.press(u.getByTestId('write-question-detach')); });

    expect(u.queryByTestId('write-question-banner')).toBeNull();
    // The words are untouched — detaching is about the question, not the draft.
    expect((u.getByLabelText('Your confession') as any).props.value)
      .toBe('half a sentence already');
    expect(mockTrack.mock.calls.map(([n]) => n)).toContain('questionDetached');
  });

  it('sends the question id with the submission', async () => {
    mockSubmit.mockResolvedValue({ type: 'match', match: { id: 'x', text: 'y', feltCount: 1 } });
    const u = await write({ questionId: Q.id });
    await waitFor(() => expect(u.getByTestId('write-question-banner')).toBeTruthy());

    await act(async () => {
      fireEvent.changeText(u.getByLabelText('Your confession'),
        'i never sent the message i wrote out three times that night');
    });
    await act(async () => { fireEvent.press(u.getByText('Let it out')); });

    await waitFor(() => expect(mockSubmit).toHaveBeenCalled());
    expect(mockSubmit.mock.calls[0][5]).toBe(Q.id);
  });

  it('sends null once detached', async () => {
    mockSubmit.mockResolvedValue({ type: 'match', match: { id: 'x', text: 'y', feltCount: 1 } });
    const u = await write({ questionId: Q.id });
    await waitFor(() => expect(u.getByTestId('write-question-banner')).toBeTruthy());
    await act(async () => { fireEvent.press(u.getByTestId('write-question-detach')); });

    await act(async () => {
      fireEvent.changeText(u.getByLabelText('Your confession'),
        'i never sent the message i wrote out three times that night');
    });
    await act(async () => { fireEvent.press(u.getByText('Let it out')); });

    await waitFor(() => expect(mockSubmit).toHaveBeenCalled());
    expect(mockSubmit.mock.calls[0][5]).toBeNull();
  });

  it('never prepends the question to the text that is sent', async () => {
    mockSubmit.mockResolvedValue({ type: 'match', match: { id: 'x', text: 'y', feltCount: 1 } });
    const u = await write({ questionId: Q.id });
    await waitFor(() => expect(u.getByTestId('write-question-banner')).toBeTruthy());

    const words = 'i never sent the message i wrote out three times that night';
    await act(async () => { fireEvent.changeText(u.getByLabelText('Your confession'), words); });
    await act(async () => { fireEvent.press(u.getByText('Let it out')); });

    await waitFor(() => expect(mockSubmit).toHaveBeenCalled());
    expect(mockSubmit.mock.calls[0][0]).toBe(words);
    expect(mockSubmit.mock.calls[0][0]).not.toContain(Q.text);
  });

  it('records the answer by id, never by text', async () => {
    mockSubmit.mockResolvedValue({ type: 'match', match: { id: 'x', text: 'y', feltCount: 1 } });
    const u = await write({ questionId: Q.id });
    await waitFor(() => expect(u.getByTestId('write-question-banner')).toBeTruthy());
    await act(async () => {
      fireEvent.changeText(u.getByLabelText('Your confession'),
        'i never sent the message i wrote out three times that night');
    });
    await act(async () => { fireEvent.press(u.getByText('Let it out')); });
    await waitFor(() => expect(mockSubmit).toHaveBeenCalled());

    const call = mockTrack.mock.calls.find(([n]) => n === 'questionAnswerSubmitted');
    expect(call![1]).toEqual([Q.id]);
    expect(JSON.stringify(mockTrack.mock.calls)).not.toContain(Q.text);
  });

  it('a crisis answer routes to crisis and records no answer', async () => {
    mockSubmit.mockResolvedValue({ type: 'crisis' });
    const u = await write({ questionId: Q.id });
    await waitFor(() => expect(u.getByTestId('write-question-banner')).toBeTruthy());
    await act(async () => {
      // Over the 40-char short-draft nudge threshold (W1), which would otherwise
      // intercept this submit before it reaches the server.
      fireEvent.changeText(u.getByLabelText('Your confession'),
        'i do not want to be here anymore and i have stopped telling anyone');
    });
    await act(async () => { fireEvent.press(u.getByText('Let it out')); });
    await waitFor(() => expect(mockSubmit).toHaveBeenCalled());

    expect(mockTrack.mock.calls.map(([n]) => n)).not.toContain('questionAnswerSubmitted');
  });
});

// ─── Pinned, and the dismiss that pinning made necessary ─────────────────────

describe('the question opens the feed and then scrolls away', () => {
  const fs   = require('fs');
  const path = require('path');
  const explore = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app', '(tabs)', 'explore.tsx'), 'utf8');
  // Guards constrain CODE; a comment explaining the old arrangement would
  // otherwise fail the guard against it.
  const code = explore.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')
                      .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');

  /**
   * Owner decision 2026-10-01 — this REVERSES the arrangement the previous
   * version of this block pinned.
   *
   * It was pinned above the list so a reader who had started reading could
   * always see it. That made it a card permanently parked on top of the one
   * reading surface, above every confession, every session. It is the list's
   * header again: first, then passed.
   *
   * The reason it was pinned has not gone away, it is answered differently —
   * `featured` makes it hard to miss once rather than impossible to miss
   * ever.
   */
  it('is the list header, so it scrolls with the feed', () => {
    const header = code.indexOf('ListHeaderComponent={questionHeader}');
    expect(header).toBeGreaterThan(-1);
    expect(code).toMatch(/const questionHeader = useMemo\(/);

    const block = code.slice(code.indexOf('const questionHeader'));
    expect(block.slice(0, block.indexOf('}, ['))).toContain('<QuestionCard');
  });

  it('is not pinned outside the list any more', () => {
    // The pinned region still exists — the filter chip lives there — so the
    // guard is that the CARD is not in it, not that the region is gone.
    const pinnedUses = [...code.matchAll(/<View style=\{styles\.pinned\}>/g)];
    for (const m of pinnedUses) {
      const region = code.slice(m.index, m.index + 600);
      expect(region).not.toContain('<QuestionCard');
    }
  });

  it('gets the featured treatment, since it no longer stays on screen', () => {
    const block = code.slice(code.indexOf('<QuestionCard'));
    expect(block.slice(0, block.indexOf('/>'))).toMatch(/featured/);
  });

  it('is a header, never a row — it must never count as a confession', () => {
    // `visible` is the confession array the allowance, the impressions and
    // the separators all index into. A question inside it would be counted
    // against somebody's ten a day.
    expect(code).toMatch(/data=\{visible\}/);
    const data = code.indexOf('data={visible}');
    const hdr  = code.indexOf('ListHeaderComponent={questionHeader}');
    expect(hdr).toBeGreaterThan(data);
  });

  it('the filter chip stays PINNED — it is the only way out of the filter', () => {
    // Scrolled out of sight it left a reader stuck in a short filtered list
    // with no exit. Unlike the question card, this one does not scroll.
    expect(code).toContain('question-filter-chip');
    const chip = code.indexOf('question-filter-chip');
    const list = code.indexOf('data={visible}');
    expect(chip).toBeGreaterThan(-1);
    expect(chip).toBeLessThan(list);
  });

  it('shows the card or the chip, never both', () => {
    // They are the two directions of one switch.
    expect(code).toMatch(/!question \|\| filterQuestion !== null \|\| questionHidden/);
    expect(code).toMatch(/question && filterQuestion !== null/);
  });

  it('hands the card stable callbacks', () => {
    // Memoised into the list header, so inline arrows would rebuild it on
    // every impression and every felt and restart its entrance.
    const start = code.indexOf('<QuestionCard');
    const block = code.slice(start, code.indexOf('/>', start));
    expect(block).not.toMatch(/=\{\(\)\s*=>/);
    expect(block).toMatch(/onDismiss=\{onDismissQuestion\}/);
  });
});

describe('dismissing this week\'s question', () => {
  it('is a real button, not a corner text link', async () => {
    // Pinned, the card does not go anywhere on its own, so declining is a
    // deliberate action and needs a control that reads as one.
    const u = await card(Q);
    const dismiss = u.getByTestId('question-dismiss');
    expect(dismiss.props.accessibilityRole).toBe('button');
  });

  it('is quieter than the thing it declines', async () => {
    /**
     * The hierarchy IS the feature: "Answer it" is the loud one, and a
     * dismiss at equal weight would turn one invitation into two equal
     * choices. TertiaryButton has no fill, no border and no depth — that
     * absence is what makes it the third rung.
     */
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'components', 'QuestionCard.tsx'), 'utf8');
    expect(src).toMatch(/<TertiaryButton/);
    // Not a Ghost or a Primary, which would both read as an equal choice.
    const block = src.slice(src.indexOf('<TertiaryButton'), src.indexOf('/>', src.indexOf('<TertiaryButton')));
    expect(src).not.toMatch(/<GhostButton[\s\S]*?label="Not now"/);
    expect(block).toMatch(/label="Not now"/);
  });

  it('still says "Not now" — declining an invitation is not an error', async () => {
    const u = await card(Q);
    expect(u.getByText('Not now')).toBeTruthy();
  });

  it('takes the card away', async () => {
    const onDismiss = jest.fn();
    const u = await card(Q, { onDismiss });
    await act(async () => { fireEvent.press(u.getByTestId('question-dismiss')); });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
