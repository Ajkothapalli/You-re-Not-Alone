/**
 * Regression guard for telling "signed out" apart from "load failed".
 *
 * The bug this exists for: explore.tsx caught every failure from
 * getRecommendations and rendered the same "Nothing here yet — add more
 * reading categories" empty state. A missing session therefore looked
 * identical to a genuinely empty match set, so the obvious response (edit
 * your categories) changed nothing and the feed appeared broken for no
 * visible reason. Confirmed on a signed-out client: the thrown message was
 * "Not authenticated" the whole time.
 *
 * These pin the classification the screen branches on.
 */

import { AuthRequiredError, isAuthError } from '@/lib/api';

describe('isAuthError', () => {
  it('recognises the typed error', () => {
    expect(isAuthError(new AuthRequiredError())).toBe(true);
  });

  it('still recognises call sites that throw a plain Error', () => {
    // Several older callers throw this by hand; they must not be
    // misclassified as retryable network failures.
    expect(isAuthError(new Error('Not authenticated'))).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isAuthError(new Error('not authenticated'))).toBe(true);
  });

  it('does NOT claim a network failure is an auth failure', () => {
    // This is the half that matters most: misreading a flaky connection as a
    // dead session would sign people out of a working account.
    expect(isAuthError(new Error('Network request failed'))).toBe(false);
    expect(isAuthError(new Error('FunctionsFetchError'))).toBe(false);
  });

  it('survives non-Error throws without blowing up', () => {
    expect(isAuthError(undefined)).toBe(false);
    expect(isAuthError(null)).toBe(false);
    expect(isAuthError('Not authenticated')).toBe(false);
  });

  it('carries the message the app already used, so nothing downstream shifts', () => {
    expect(new AuthRequiredError().message).toBe('Not authenticated');
    expect(new AuthRequiredError().name).toBe('AuthRequiredError');
  });
});
