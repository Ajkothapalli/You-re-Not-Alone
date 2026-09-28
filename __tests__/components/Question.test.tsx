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
}));

import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import QuestionCard from '@/components/QuestionCard';
import WriteScreen from '../../app/write';
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
