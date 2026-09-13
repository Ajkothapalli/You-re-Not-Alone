/**
 * lib/authCallback.ts — single-use claim on an OAuth callback credential.
 *
 * The claim is what stops two callers exchanging the same PKCE code (the
 * browser's success URL, the Linking 'url' event, getInitialURL, and the
 * /auth handoff can all carry it). Its two load-bearing properties are that
 * it is EXACTLY-ONCE and that it is SYNCHRONOUS — an await between the check
 * and the claim would let both callers through.
 */

import {
  claimAuthCredential,
  isAuthCredentialClaimed,
  extractAuthCode,
  isAuthCallbackUrl,
} from '@/lib/authCallback';

describe('claimAuthCredential', () => {
  it('grants the claim exactly once per credential', () => {
    expect(claimAuthCredential('code-once')).toBe(true);
    expect(claimAuthCredential('code-once')).toBe(false);
    expect(claimAuthCredential('code-once')).toBe(false);
  });

  it('tracks credentials independently', () => {
    expect(claimAuthCredential('code-a')).toBe(true);
    expect(claimAuthCredential('code-b')).toBe(true);
    expect(claimAuthCredential('code-a')).toBe(false);
  });

  it('is synchronous — concurrent callers cannot both win', async () => {
    // Models the real race: several handlers reach the claim in the same tick.
    // If the check and the claim were separated by an await, every one of
    // these would see "unclaimed" and go on to exchange the same single-use
    // code, which is the failure the module exists to prevent.
    const winners = await Promise.all(
      Array.from({ length: 5 }, async () => claimAuthCredential('code-race')),
    );
    expect(winners.filter(Boolean)).toHaveLength(1);
  });

  it('reports a claimed credential without taking the claim', () => {
    expect(isAuthCredentialClaimed('code-peek')).toBe(false);
    expect(isAuthCredentialClaimed('code-peek')).toBe(false);
    expect(claimAuthCredential('code-peek')).toBe(true);
    expect(isAuthCredentialClaimed('code-peek')).toBe(true);
  });

  it('survives across importers — the claim is module state, not component state', () => {
    // The cold-start path claims from app/auth.tsx's handoff and then app/index.tsx
    // mounts fresh. A useRef would start empty here and re-claim a spent code.
    claimAuthCredential('code-shared');
    const { claimAuthCredential: again } = require('@/lib/authCallback');
    expect(again('code-shared')).toBe(false);
  });
});

describe('extractAuthCode', () => {
  it('reads the code from a query string', () => {
    expect(extractAuthCode('soulyap://auth?code=abc123')).toBe('abc123');
  });

  it('reads the code when other params come first', () => {
    expect(extractAuthCode('soulyap://auth?state=xyz&code=def456')).toBe('def456');
  });

  it('percent-decodes', () => {
    expect(extractAuthCode('soulyap://auth?code=abc%2Fdef')).toBe('abc/def');
  });

  it('returns null for a magic link, which carries no code', () => {
    expect(extractAuthCode('soulyap://auth#access_token=tok&refresh_token=ref')).toBeNull();
  });

  it('returns null for a bare URL', () => {
    expect(extractAuthCode('soulyap://auth')).toBeNull();
  });
});

describe('isAuthCallbackUrl', () => {
  it('accepts a PKCE callback', () => {
    expect(isAuthCallbackUrl('soulyap://auth?code=abc')).toBe(true);
  });

  it('accepts an implicit-flow magic link', () => {
    expect(isAuthCallbackUrl('soulyap://auth#access_token=tok')).toBe(true);
  });

  it('rejects a cancelled consent screen, which carries no credential', () => {
    expect(isAuthCallbackUrl('soulyap://auth?error=access_denied')).toBe(false);
  });

  it('rejects the app\'s own launch URL', () => {
    expect(isAuthCallbackUrl('soulyap://')).toBe(false);
  });
});
