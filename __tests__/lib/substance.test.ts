/**
 * [3.6] SUBSTANCE — the genuine-confession gate.
 *
 * Two halves are tested very differently on purpose.
 *
 * The ACCEPT list matters more than the reject list. A false reject tells a
 * real person that what they just wrote does not count, which is the worst
 * thing this app can say to someone — so the accept cases include the ones
 * most likely to be caught by a naive heuristic: a four-word sentence, Hindi,
 * Hinglish transliteration, a spaceless Chinese sentence, lowercase slang with
 * stretched vowels, and a confession containing an age and a year.
 *
 * Layer 1 is pure and has no I/O, so it is tested directly. Layer 2's
 * transport is injected, which lets the unreachable and malformed cases be
 * tested as behaviour rather than asserted from source.
 */

import {
  checkLayer1, checkLayer2, checkSubstance,
  type SubstanceReason,
} from '../../supabase/functions/_shared/substance';

// ─── Layer 1: what must be rejected ──────────────────────────────────────────

describe('Layer 1 rejects obvious junk', () => {
  it.each<[string, SubstanceReason]>([
    ['aaaaaaaaaaaa',            'repetition'],
    ['hahahahahahaha',          'repetition'],
    ['test test test test',     'repetition'],
    ['😭😭😭😭😭😭',              'no_letters'],
    ['1234567890',              'no_letters'],
    ['hello',                   'too_short'],
    ['sad',                     'too_short'],
    ['www.example.com',         'contact_or_link'],
    ['dm me on insta @soulyap_x', 'contact_or_link'],
    ['call me 98765 43210',     'contact_or_link'],
  ])('%j -> %s', (text, reason) => {
    expect(checkLayer1(text)).toBe(reason);
  });

  it('passes two words of keyboard mash to Layer 2', () => {
    // Under the earlier 3-word floor this was caught as too_short. Lowering
    // the floor to 2 (so "I cheated." can post) hands it to the meaning check
    // instead, which is where judging gibberish always belonged.
    expect(checkLayer1('asdfghjkl qwe')).toBeNull();
  });

  it('catches more contact shapes than the listed ones', () => {
    for (const t of [
      'reach me at someone@example.com please',
      'https://example.com/my-page here',
      'find me on telegram @handle_name ok',
      'my number is +91 98765 43210 call me',
    ]) expect(checkLayer1(t)).toBe('contact_or_link');
  });
});

// ─── Layer 1: what must NEVER be rejected ────────────────────────────────────

describe('Layer 1 lets genuine confessions through', () => {
  it.each([
    'I never loved him.',
    "I'm gay.",
    'I cheated.',
    'I miss my dad.',
    'I miss her every single day',
    'मैं उससे कभी प्यार नहीं करता था',
    'maine usse kabhi pyaar nahi kiya',
    '我从来没有爱过他',
    'sooo tired of pretending im fine',
    'I was 17 in 2009 and I still think about it',
  ])('%j passes Layer 1', (text) => {
    expect(checkLayer1(text)).toBeNull();
  });

  it('does not read an age or a year as a phone number', () => {
    // Six digits are present across "17" and "2009"; a rule that stripped
    // non-digits globally would see 172009 and reject a real confession.
    expect(checkLayer1('I was 17 in 2009 and I still think about it')).toBeNull();
    expect(checkLayer1('she was 19 and I was 22 and it was 2014 back then')).toBeNull();
  });

  it('measures a spaceless script in letters, not words or characters', () => {
    // 8 characters, one "word", no spaces: the 10-char and 3-word rules would
    // both reject a complete Chinese sentence.
    expect('我从来没有爱过他'.length).toBe(8);
    expect(checkLayer1('我从来没有爱过他')).toBeNull();
    expect(checkLayer1('私は彼を愛していなかった')).toBeNull();
    expect(checkLayer1('ฉันไม่เคยรักเขาเลย')).toBeNull();
  });

  it('still applies a floor to spaceless scripts', () => {
    // 3 letters is under the 6-letter floor; 我从来没有爱过他 (8) is over it.
    expect(checkLayer1('我爱你')).toBe('too_short');
  });

  it('does not mistake a normal sentence for repetition', () => {
    // "that" appears twice of eight words — a 60% threshold must not fire.
    expect(checkLayer1('I told her that I was fine but that was a lie')).toBeNull();
  });
});

// ─── Layer 2 ─────────────────────────────────────────────────────────────────

function fakeFetch(body: unknown, ok = true) {
  return (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
}

describe('Layer 2 meaning check', () => {
  it('returns null with no API key — never a rejection', () => {
    return expect(checkLayer2('anything', { apiKey: null })).resolves.toBeNull();
  });

  it('reads the two valid answers', async () => {
    const yes = await checkLayer2('x', {
      apiKey: 'k', fetchImpl: fakeFetch({ choices: [{ message: { content: 'GENUINE' } }] }) });
    const no = await checkLayer2('x', {
      apiKey: 'k', fetchImpl: fakeFetch({ choices: [{ message: { content: 'NOT_GENUINE' } }] }) });
    expect(yes).toBe(true);
    expect(no).toBe(false);
  });

  it('treats anything else as no verdict, not as a rejection', async () => {
    // A model that starts explaining itself must not cost someone their
    // confession.
    for (const content of [
      'NOT_GENUINE because it looks like gibberish',
      'genuine!', '', 'MAYBE', 'null', '{"answer":"GENUINE"}',
    ]) {
      const v = await checkLayer2('x', {
        apiKey: 'k', fetchImpl: fakeFetch({ choices: [{ message: { content } }] }) });
      expect(v).toBeNull();
    }
  });

  it('accepts a lowercase answer', async () => {
    const v = await checkLayer2('x', {
      apiKey: 'k', fetchImpl: fakeFetch({ choices: [{ message: { content: ' genuine ' } }] }) });
    expect(v).toBe(true);
  });

  it('returns null on a non-200, a malformed body, or a thrown request', async () => {
    const bad = await checkLayer2('x', { apiKey: 'k', fetchImpl: fakeFetch({}, false) });
    const junk = await checkLayer2('x', { apiKey: 'k', fetchImpl: fakeFetch({ nope: 1 }) });
    const threw = await checkLayer2('x', {
      apiKey: 'k',
      fetchImpl: (async () => { throw new Error('network'); }) as unknown as typeof fetch,
    });
    expect(bad).toBeNull();
    expect(junk).toBeNull();
    expect(threw).toBeNull();
  });

  it('sends temperature 0 and a 4-token cap', async () => {
    let sent: any;
    const spy = (async (_u: string, init: any) => {
      sent = JSON.parse(init.body);
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'GENUINE' } }] }) };
    }) as unknown as typeof fetch;
    await checkLayer2('hello there', { apiKey: 'k', fetchImpl: spy });
    expect(sent.temperature).toBe(0);
    expect(sent.max_tokens).toBe(4);
    expect(sent.model).toBe('gpt-4o-mini');
  });
});

// ─── The gate as a whole ─────────────────────────────────────────────────────

describe('checkSubstance fails OPEN', () => {
  it('passes when Layer 2 says GENUINE', async () => {
    const r = await checkSubstance('I never loved him.', {
      apiKey: 'k', fetchImpl: fakeFetch({ choices: [{ message: { content: 'GENUINE' } }] }) });
    expect(r).toEqual({ ok: true, check: 'passed' });
  });

  it('is unchecked — and still allowed — when Layer 2 cannot answer', async () => {
    for (const deps of [
      { apiKey: null },
      { apiKey: 'k', fetchImpl: fakeFetch({}, false) },
      { apiKey: 'k', fetchImpl: fakeFetch({ choices: [{ message: { content: 'hmm' } }] }) },
    ]) {
      const r = await checkSubstance('I miss her every single day', deps as any);
      expect(r).toEqual({ ok: true, check: 'unchecked' });
    }
  });

  it('rejects with not_genuine only on an explicit NOT_GENUINE', async () => {
    const r = await checkSubstance('asdf jkl qwe rty', {
      apiKey: 'k', fetchImpl: fakeFetch({ choices: [{ message: { content: 'NOT_GENUINE' } }] }) });
    expect(r).toEqual({ ok: false, reason: 'not_genuine' });
  });

  it('never calls Layer 2 when Layer 1 already rejected', async () => {
    let called = false;
    const spy = (async () => { called = true; return { ok: true, json: async () => ({}) }; }) as unknown as typeof fetch;
    const r = await checkSubstance('hello', { apiKey: 'k', fetchImpl: spy });
    expect(r).toEqual({ ok: false, reason: 'too_short' });
    expect(called).toBe(false);
  });
});
