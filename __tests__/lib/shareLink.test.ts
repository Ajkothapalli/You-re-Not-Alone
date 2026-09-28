/**
 * The share link is the one string this app puts in front of strangers, beside
 * a confession. What may be in it is a privacy boundary, not a formatting
 * preference — so the tests that matter here are the ones asserting what is
 * ABSENT.
 */

import {
  buildShareLink, isValidToken, shareMessage, SHARE_ORIGIN, TOKEN_RE,
} from '@/lib/shareLink';

describe('the link carries the bucket and nothing more', () => {
  it.each(['match', 'rtue', 'read'] as const)('%s with no token', (source) => {
    expect(buildShareLink(source)).toBe(`https://soulyap.me/s?c=${source}`);
  });

  it('appends a valid token', () => {
    expect(buildShareLink('read', 'aB3xY9zQ7m'))
      .toBe('https://soulyap.me/s?c=read&t=aB3xY9zQ7m');
  });

  it('has exactly the parameters c and t — never a third', () => {
    const params = new URL(buildShareLink('match', 'aB3xY9zQ7m')).searchParams;
    expect([...params.keys()].sort()).toEqual(['c', 't']);
  });

  it('is https and points at soulyap.me', () => {
    const u = new URL(buildShareLink('rtue', 'aB3xY9zQ7m'));
    expect(u.protocol).toBe('https:');
    expect(u.host).toBe('soulyap.me');
    expect(SHARE_ORIGIN).toBe('https://soulyap.me');
  });
});

describe('a bad token never breaks the share, it just drops', () => {
  it.each([
    [null, 'null'], [undefined, 'undefined'], ['', 'empty'],
    ['short', 'too short'], ['waytoolongtoken', 'too long'],
    ['abc-def_gh', 'not base62'], ['abc def gh', 'a space'],
    ['../../etc/pa', 'a traversal attempt'],
    ['aB3xY9zQ7m&x=1', 'a smuggled parameter'],
    [12345 as unknown as string, 'a number'],
    [{} as unknown as string, 'an object'],
  ] as [unknown, string][])('%s (%s) falls back to the bucket-only link', (token) => {
    expect(buildShareLink('read', token as string)).toBe('https://soulyap.me/s?c=read');
  });

  it('a rejected token can never inject a parameter', () => {
    // The failure that would matter: a token containing & or = slipping in and
    // adding a field the landing page then reads.
    const link = buildShareLink('read', 'aB3xY9zQ7m&utm_id=42');
    expect(new URL(link).searchParams.has('utm_id')).toBe(false);
  });
});

describe('isValidToken matches exactly what the server mints', () => {
  it('accepts 10 base62 characters', () => {
    expect(isValidToken('aB3xY9zQ7m')).toBe(true);
    expect(isValidToken('0000000000')).toBe(true);
    expect(isValidToken('ZZZZZZZZZZ')).toBe(true);
  });

  it('is anchored at both ends', () => {
    // An unanchored regex would accept a token with anything appended.
    expect(TOKEN_RE.source.startsWith('^')).toBe(true);
    expect(TOKEN_RE.source.endsWith('$')).toBe(true);
    expect(isValidToken('aB3xY9zQ7m\nevil')).toBe(false);
  });
});

describe('nothing identifying reaches the link or the message', () => {
  const link = buildShareLink('match', 'aB3xY9zQ7m');
  const msg  = shareMessage(link);

  it.each(['account', 'author', 'confession', 'persona', 'felt', 'uuid', 'user'])(
    'the link says nothing about %s', (word) => {
      expect(link.toLowerCase()).not.toContain(word);
    });

  it('the message carries the link and no confession text', () => {
    expect(msg).toContain(link);
    // A UUID-shaped string anywhere here would mean an id had leaked in.
    expect(msg).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
  });

  it('two links from the same bucket differ only by their random token', () => {
    // The property that keeps shares unlinkable: nothing in the URL is derived
    // from the sender, so two of their shares look like two strangers'.
    const a = buildShareLink('read', 'aaaaaaaaaa');
    const b = buildShareLink('read', 'bbbbbbbbbb');
    expect(a.replace('aaaaaaaaaa', 'X')).toBe(b.replace('bbbbbbbbbb', 'X'));
  });
});
