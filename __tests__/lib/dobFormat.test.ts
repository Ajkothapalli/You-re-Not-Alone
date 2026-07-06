import { maskDob, dobToISO, isAdultISO, getDobOrder } from '@/lib/dobFormat';
import type { DobPart } from '@/lib/dobFormat';

const DMY: DobPart[] = ['day', 'month', 'year'];
const MDY: DobPart[] = ['month', 'day', 'year'];
const YMD: DobPart[] = ['year', 'month', 'day'];

// ─── maskDob — DD-MM-YYYY order ──────────────────────────────────────────────

describe('maskDob (DD-MM-YYYY)', () => {
  it('"1" → "1"', () => {
    expect(maskDob('1', '', DMY)).toBe('1');
  });

  it('"14" typed forward → "14-"', () => {
    expect(maskDob('14', '1', DMY)).toBe('14-');
  });

  it('"1407" pasted (forward from empty) → "14-07-"', () => {
    expect(maskDob('1407', '', DMY)).toBe('14-07-');
  });

  it('"14071999" pasted → "14-07-1999"', () => {
    expect(maskDob('14071999', '', DMY)).toBe('14-07-1999');
  });

  it('"14/07/1999" pasted (non-digit separators stripped) → "14-07-1999"', () => {
    expect(maskDob('14/07/1999', '', DMY)).toBe('14-07-1999');
  });

  it('more than 8 digits are truncated → "14-07-1999"', () => {
    expect(maskDob('14071999999', '', DMY)).toBe('14-07-1999');
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
    v = maskDob('14-07-1',   v, DMY); expect(v).toBe('14-07-1');
    v = maskDob('14-07-19',  v, DMY); expect(v).toBe('14-07-19');
    v = maskDob('14-07-199', v, DMY); expect(v).toBe('14-07-199');
    v = maskDob('14-07-1999',v, DMY); expect(v).toBe('14-07-1999');
  });
});

// ─── maskDob — YYYY-MM-DD order ──────────────────────────────────────────────

describe('maskDob (YYYY-MM-DD)', () => {
  it('"1999" → "1999-"', () => {
    expect(maskDob('1999', '', YMD)).toBe('1999-');
  });

  it('"19990714" → "1999-07-14"', () => {
    expect(maskDob('19990714', '', YMD)).toBe('1999-07-14');
  });
});

// ─── dobToISO ────────────────────────────────────────────────────────────────

describe('dobToISO', () => {
  it('valid DD-MM-YYYY "14-07-1999" → "1999-07-14"', () => {
    expect(dobToISO('14-07-1999', DMY)).toBe('1999-07-14');
  });

  it('"31-02-2000" → null (Feb has no 31st)', () => {
    expect(dobToISO('31-02-2000', DMY)).toBeNull();
  });

  it('"29-02-2000" → "2000-02-29" (2000 is a leap year)', () => {
    expect(dobToISO('29-02-2000', DMY)).toBe('2000-02-29');
  });

  it('"29-02-1999" → null (1999 is not a leap year)', () => {
    expect(dobToISO('29-02-1999', DMY)).toBeNull();
  });

  it('month 13 → null', () => {
    expect(dobToISO('01-13-1990', DMY)).toBeNull();
  });

  it('future date → null', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const dd = String(future.getDate()).padStart(2, '0');
    const mm = String(future.getMonth() + 1).padStart(2, '0');
    const yyyy = String(future.getFullYear());
    expect(dobToISO(`${dd}-${mm}-${yyyy}`, DMY)).toBeNull();
  });

  it('year 1800 → null (beyond 120-year window)', () => {
    expect(dobToISO('01-01-1800', DMY)).toBeNull();
  });

  it('too few digits → null', () => {
    expect(dobToISO('14-07', DMY)).toBeNull();
  });

  it('valid MM-DD-YYYY "07-14-1999" → "1999-07-14"', () => {
    expect(dobToISO('07-14-1999', MDY)).toBe('1999-07-14');
  });

  it('valid YYYY-MM-DD "1999-07-14" → "1999-07-14"', () => {
    expect(dobToISO('1999-07-14', YMD)).toBe('1999-07-14');
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

  it('en-US parts → month-day-year, "MM-DD-YYYY"', () => {
    mockIntlParts([
      { type: 'month',   value: '11' },
      { type: 'literal', value: '/' },
      { type: 'day',     value: '22' },
      { type: 'literal', value: '/' },
      { type: 'year',    value: '2000' },
    ]);
    const { order, placeholder } = getDobOrder();
    expect(order).toEqual(['month', 'day', 'year']);
    expect(placeholder).toBe('MM-DD-YYYY');
  });

  it('en-IN parts → day-month-year, "DD-MM-YYYY"', () => {
    mockIntlParts([
      { type: 'day',     value: '22' },
      { type: 'literal', value: '/' },
      { type: 'month',   value: '11' },
      { type: 'literal', value: '/' },
      { type: 'year',    value: '2000' },
    ]);
    const { order, placeholder } = getDobOrder();
    expect(order).toEqual(['day', 'month', 'year']);
    expect(placeholder).toBe('DD-MM-YYYY');
  });

  it('ja-JP parts → year-month-day, "YYYY-MM-DD"', () => {
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
    expect(placeholder).toBe('YYYY-MM-DD');
  });

  it('Intl throwing → DD-MM-YYYY fallback', () => {
    (global as any).Intl = {
      ...origIntl,
      DateTimeFormat: jest.fn(() => ({
        formatToParts: jest.fn(() => { throw new Error('Intl unavailable'); }),
      })),
    };
    const { order, placeholder } = getDobOrder();
    expect(order).toEqual(['day', 'month', 'year']);
    expect(placeholder).toBe('DD-MM-YYYY');
  });
});
