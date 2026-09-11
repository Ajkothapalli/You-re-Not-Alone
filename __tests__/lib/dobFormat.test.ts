import { maskDob, dobToISO, isAdultISO, getDobOrder } from '@/lib/dobFormat';
import type { DobPart } from '@/lib/dobFormat';

const DMY: DobPart[] = ['day', 'month', 'year'];
const MDY: DobPart[] = ['month', 'day', 'year'];
const YMD: DobPart[] = ['year', 'month', 'day'];

// ─── maskDob — DD-MM-YY order ────────────────────────────────────────────────

describe('maskDob (DD-MM-YY)', () => {
  it('"1" → "1"', () => {
    expect(maskDob('1', '', DMY)).toBe('1');
  });

  it('"14" typed forward → "14-"', () => {
    expect(maskDob('14', '1', DMY)).toBe('14-');
  });

  it('"1407" pasted (forward from empty) → "14-07-"', () => {
    expect(maskDob('1407', '', DMY)).toBe('14-07-');
  });

  it('"140799" pasted → "14-07-99"', () => {
    expect(maskDob('140799', '', DMY)).toBe('14-07-99');
  });

  it('"14/07/99" pasted (non-digit separators stripped) → "14-07-99"', () => {
    expect(maskDob('14/07/99', '', DMY)).toBe('14-07-99');
  });

  it('more than 6 digits are truncated → "14-07-99"', () => {
    expect(maskDob('14079999999', '', DMY)).toBe('14-07-99');
  });

  it('backspace from "14-07-" → "14-0" (no trailing hyphen re-added)', () => {
    // User deleted the trailing hyphen; prev digit count equals new digit count
    // so we drop one extra digit to give natural backspace feel.
    expect(maskDob('14-07', '14-07-', DMY)).toBe('14-0');
  });

  it('normal backspace within a field: "14-0" → "14"', () => {
    // Deletes the "0"; not typing forward, no trailing hyphen re-added.
    expect(maskDob('14-', '14-0', DMY)).toBe('14');
  });

  it('backspace from "14-" → "1" (also drops extra digit)', () => {
    expect(maskDob('14', '14-', DMY)).toBe('1');
  });

  it('in-progress typing step by step', () => {
    let v = '';
    v = maskDob('1',    v, DMY); expect(v).toBe('1');
    v = maskDob('14',   v, DMY); expect(v).toBe('14-');
    v = maskDob('14-0', v, DMY); expect(v).toBe('14-0');
    v = maskDob('14-07',v, DMY); expect(v).toBe('14-07-');
    v = maskDob('14-07-9',   v, DMY); expect(v).toBe('14-07-9');
    v = maskDob('14-07-99',  v, DMY); expect(v).toBe('14-07-99');
  });
});

// ─── maskDob — YY-MM-DD order ────────────────────────────────────────────────

describe('maskDob (YY-MM-DD)', () => {
  it('"99" → "99-"', () => {
    expect(maskDob('99', '', YMD)).toBe('99-');
  });

  it('"990714" → "99-07-14"', () => {
    expect(maskDob('990714', '', YMD)).toBe('99-07-14');
  });
});

// ─── dobToISO ────────────────────────────────────────────────────────────────

describe('dobToISO', () => {
  it('valid DD-MM-YY "14-07-99" → "1999-07-14"', () => {
    expect(dobToISO('14-07-99', DMY)).toBe('1999-07-14');
  });

  it('"31-02-00" → null (Feb has no 31st)', () => {
    expect(dobToISO('31-02-00', DMY)).toBeNull();
  });

  it('"29-02-00" → "2000-02-29" (2000 is a leap year)', () => {
    expect(dobToISO('29-02-00', DMY)).toBe('2000-02-29');
  });

  it('"29-02-99" → null (1999 is not a leap year)', () => {
    expect(dobToISO('29-02-99', DMY)).toBeNull();
  });

  it('month 13 → null', () => {
    expect(dobToISO('01-13-90', DMY)).toBeNull();
  });

  it('future date within the current year → null', () => {
    // A 2-digit year can never expand past the current year (the expansion
    // window always ends at "now"), so the only reachable future dates are
    // later in the current calendar year — e.g. Dec 31, unless today already
    // is Dec 31, in which case there's no later in-year date to test.
    const now = new Date();
    if (now.getMonth() === 11 && now.getDate() === 31) return;
    const yy = String(now.getFullYear() % 100).padStart(2, '0');
    expect(dobToISO(`31-12-${yy}`, DMY)).toBeNull();
  });

  it('too few digits → null', () => {
    expect(dobToISO('14-07', DMY)).toBeNull();
  });

  it('valid MM-DD-YY "07-14-99" → "1999-07-14"', () => {
    expect(dobToISO('07-14-99', MDY)).toBe('1999-07-14');
  });

  it('valid YY-MM-DD "99-07-14" → "1999-07-14"', () => {
    expect(dobToISO('99-07-14', YMD)).toBe('1999-07-14');
  });
});

// ─── dobToISO — 2-digit year expansion ────────────────────────────────────────

describe('dobToISO year expansion', () => {
  const currentYY = new Date().getFullYear() % 100;

  it('YY equal to current year mod 100 → current year (this-year pivot)', () => {
    const yy = String(currentYY).padStart(2, '0');
    const iso = dobToISO(`01-01-${yy}`, DMY);
    expect(iso).toBe(`${new Date().getFullYear()}-01-01`);
  });

  it('YY one more than current year mod 100 → previous century', () => {
    const nextYY = (currentYY + 1) % 100;
    const yy = String(nextYY).padStart(2, '0');
    const iso = dobToISO(`01-01-${yy}`, DMY);
    const expectedYear = 1900 + nextYY;
    expect(iso).toBe(`${expectedYear}-01-01`);
  });

  it('"00" → 2000', () => {
    // Only meaningful while the current year's mod-100 is >= 0, always true.
    const iso = dobToISO('01-01-00', DMY);
    expect(iso).toBe('2000-01-01');
  });
});

// ─── isAdultISO ──────────────────────────────────────────────────────────────

describe('isAdultISO', () => {
  function isoYearsAgo(years: number, dayOffset = 0): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - years);
    d.setDate(d.getDate() + dayOffset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  it('exactly 18 today → true', () => {
    expect(isAdultISO(isoYearsAgo(18))).toBe(true);
  });

  it('18th birthday is tomorrow → false', () => {
    expect(isAdultISO(isoYearsAgo(18, 1))).toBe(false);
  });

  it('17 years old → false', () => {
    expect(isAdultISO(isoYearsAgo(17))).toBe(false);
  });

  it('30 years old → true', () => {
    expect(isAdultISO(isoYearsAgo(30))).toBe(true);
  });
});

// ─── getDobOrder ─────────────────────────────────────────────────────────────

describe('getDobOrder', () => {
  const origIntl = global.Intl;

  afterEach(() => {
    global.Intl = origIntl;
  });

  function mockIntlParts(parts: Array<{ type: string; value: string }>) {
    (global as any).Intl = {
      ...origIntl,
      DateTimeFormat: jest.fn(() => ({
        formatToParts: jest.fn(() => parts),
      })),
    };
  }

  it('en-US parts → month-day-year, "MM-DD-YY"', () => {
    mockIntlParts([
      { type: 'month',   value: '11' },
      { type: 'literal', value: '/' },
      { type: 'day',     value: '22' },
      { type: 'literal', value: '/' },
      { type: 'year',    value: '2000' },
    ]);
    const { order, placeholder } = getDobOrder();
    expect(order).toEqual(['month', 'day', 'year']);
    expect(placeholder).toBe('MM-DD-YY');
  });

  it('en-IN parts → day-month-year, "DD-MM-YY"', () => {
    mockIntlParts([
      { type: 'day',     value: '22' },
      { type: 'literal', value: '/' },
      { type: 'month',   value: '11' },
      { type: 'literal', value: '/' },
      { type: 'year',    value: '2000' },
    ]);
    const { order, placeholder } = getDobOrder();
    expect(order).toEqual(['day', 'month', 'year']);
    expect(placeholder).toBe('DD-MM-YY');
  });

  it('ja-JP parts → year-month-day, "YY-MM-DD"', () => {
    mockIntlParts([
      { type: 'year',    value: '2000' },
      { type: 'literal', value: '年' },
      { type: 'month',   value: '11' },
      { type: 'literal', value: '月' },
      { type: 'day',     value: '22' },
      { type: 'literal', value: '日' },
    ]);
    const { order, placeholder } = getDobOrder();
    expect(order).toEqual(['year', 'month', 'day']);
    expect(placeholder).toBe('YY-MM-DD');
  });

  it('Intl throwing → DD-MM-YY fallback', () => {
    (global as any).Intl = {
      ...origIntl,
      DateTimeFormat: jest.fn(() => ({
        formatToParts: jest.fn(() => { throw new Error('Intl unavailable'); }),
      })),
    };
    const { order, placeholder } = getDobOrder();
    expect(order).toEqual(['day', 'month', 'year']);
    expect(placeholder).toBe('DD-MM-YY');
  });
});
