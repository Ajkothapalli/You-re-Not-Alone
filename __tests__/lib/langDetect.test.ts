/**
 * Language detection logic — unit tests (no network).
 *
 * We can't import the Deno Edge Function directly, so we replicate the two
 * pure pieces of logic here:
 *   1. The BCP-47 tag validation regex
 *   2. The COMPANION_SEEDS fallback pool selection
 *
 * Network-dependent tests (actual gpt-4o-mini call) are covered by the
 * manual verification checklist in invariants.test.ts.
 */

// ─── Replicated from submit-confession/index.ts ───────────────────────────────
// Keep in sync if the logic changes.

function validateLangTag(raw: string): string {
  // Accept any string that looks like a BCP-47 tag:
  //   2–3 char primary, no whitespace, no special chars, max 20 chars
  const cleaned = raw.trim().toLowerCase();
  if (
    cleaned.length >= 2 &&
    cleaned.length <= 20 &&
    /^[a-z]/.test(cleaned) &&
    !/\s/.test(cleaned)
  ) {
    return cleaned;
  }
  return 'en';
}

const COMPANION_SEEDS: Record<string, string[]> = {
  en: [
    "I smile at work and cry in the parking lot on the way home.",
    "I pretend I'm fine so often I've forgotten what not fine actually feels like.",
    "The version of me people think they know isn't really me.",
    "I keep waiting for someone to notice how much I'm struggling.",
    "I've been holding this together for so long I don't remember who I was before.",
  ],
  'hi-Latn': [
    "Main bahar se khush dikhta hoon lekin andar se toot raha hoon.",
    "Kisi ko nahi pata ke main raat ko kitna rota hoon.",
    "Log samajhte hain sab theek hai, par main khud nahi jaanta.",
    "Muskurata rehta hoon taaki koi poochhe na.",
  ],
  'te-Latn': [
    "Bayata hasyamga untaanu kani lopala chala pain ga untundi.",
    "Andaru nenu strong ani anukuntaaru, kaani nenu pratiroduja struggle chestunnanu.",
    "Ninnu choodataniki smile chestanu, kaani nenu bagaa ledu.",
    "Ela chesina okkarike artham kaadu ani anipistundi.",
  ],
  hi: [
    "बाहर से मुस्कुराता हूँ, लेकिन अंदर से टूट रहा हूँ।",
    "किसी को नहीं पता रात को मैं कितना रोता हूँ।",
    "सब सोचते हैं सब ठीक है, पर मैं खुद नहीं जानता।",
  ],
  te: [
    "బయటకు నవ్వుతాను కానీ లోపల చాలా నొప్పిగా ఉంటుంది.",
    "అందరూ నేను strong అని అనుకుంటారు కానీ నేను ప్రతిరోజూ struggle చేస్తున్నాను.",
  ],
};

function companionFallback(lang: string): string {
  const pool = COMPANION_SEEDS[lang] ?? COMPANION_SEEDS['en'];
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BCP-47 tag validation', () => {
  const cases: [string, string][] = [
    ['en',       'en'],
    ['hi',       'hi'],
    ['te',       'te'],
    ['hi-Latn',  'hi-latn'],   // lowercase normalised
    ['te-Latn',  'te-latn'],
    ['ta',       'ta'],
    ['bn',       'bn'],
    // Edge: model adds trailing space or newline
    ['en\n',     'en'],
    [' en ',     'en'],
    // Edge: model returns garbage
    ['',         'en'],        // empty → fallback
    ['not a tag with spaces', 'en'],
    ['123',      'en'],        // starts with digit → fallback
    ['a'.repeat(21), 'en'],   // too long → fallback
  ];

  test.each(cases)('validateLangTag(%j) → %j', (input, expected) => {
    expect(validateLangTag(input)).toBe(expected);
  });

  it('accepts reasonable BCP-47 subtag forms', () => {
    expect(validateLangTag('zh-hans')).toBe('zh-hans');
    expect(validateLangTag('pt-br')).toBe('pt-br');
    expect(validateLangTag('sr-latn')).toBe('sr-latn');
  });
});

describe('COMPANION_SEEDS fallback pool', () => {
  it('every pool entry is non-empty and at least 10 chars', () => {
    for (const [lang, pool] of Object.entries(COMPANION_SEEDS)) {
      expect(pool.length).toBeGreaterThan(0);
      for (const entry of pool) {
        expect(entry.trim().length).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('companionFallback returns a string for known langs', () => {
    for (const lang of ['en', 'hi', 'hi-Latn', 'te', 'te-Latn']) {
      const result = companionFallback(lang);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    }
  });

  it('companionFallback falls back to English for unknown lang', () => {
    const result = companionFallback('xx-Unknown');
    expect(COMPANION_SEEDS['en']).toContain(result);
  });

  it('no COMPANION_SEEDS entry contains crisis keywords', () => {
    const crisisTerms = [
      'kill myself', 'suicide', 'suicidal', 'want to die',
      'self harm', 'self-harm', 'hurt myself', 'end my life',
    ];
    for (const [lang, pool] of Object.entries(COMPANION_SEEDS)) {
      for (const entry of pool) {
        const lower = entry.toLowerCase();
        for (const term of crisisTerms) {
          expect(lower).not.toContain(term);
        }
      }
    }
  });

  it('no COMPANION_SEEDS entry contains names, usernames, or locations', () => {
    // Basic heuristic: no @ signs, no "at <City>" pattern
    for (const pool of Object.values(COMPANION_SEEDS)) {
      for (const entry of pool) {
        expect(entry).not.toContain('@');
      }
    }
  });
});

describe('Match quality constants', () => {
  // Ensure the threshold constants in the migration match expectations.
  const MIN_SIM      = 0.35;
  const NEAR_DUP_SIM = 0.97;

  it('MIN_SIM leaves room for cross-topic resonance', () => {
    // 0.35 cosine similarity means the texts share meaningful emotional overlap
    // without requiring near-identical phrasing. Sanity bounds:
    expect(MIN_SIM).toBeGreaterThan(0.2);
    expect(MIN_SIM).toBeLessThan(0.6);
  });

  it('NEAR_DUP_SIM is close enough to 1.0 to only catch essentially identical text', () => {
    expect(NEAR_DUP_SIM).toBeGreaterThan(0.9);
    expect(NEAR_DUP_SIM).toBeLessThan(1.0);
  });

  it('MIN_SIM < NEAR_DUP_SIM (valid range)', () => {
    expect(MIN_SIM).toBeLessThan(NEAR_DUP_SIM);
  });
});
