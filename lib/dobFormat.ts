export type DobPart = 'day' | 'month' | 'year';
export type DobOrder = { order: DobPart[]; placeholder: string };

export function getDobOrder(): DobOrder {
  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      year:  'numeric',
      month: '2-digit',
      day:   '2-digit',
    }).formatToParts(new Date(2000, 10, 22));

    const order: DobPart[] = [];
    for (const part of parts) {
      if (part.type === 'day' || part.type === 'month' || part.type === 'year') {
        order.push(part.type as DobPart);
      }
    }
    if (order.length !== 3) throw new Error('unexpected parts');

    const placeholder = order
      .map(p => p === 'year' ? 'YYYY' : p === 'month' ? 'MM' : 'DD')
      .join('-');

    return { order, placeholder };
  } catch {
    return { order: ['day', 'month', 'year'], placeholder: 'DD-MM-YYYY' };
  }
}

export function maskDob(raw: string, prev: string, order: DobPart[]): string {
  const prevDigits = prev.replace(/\D/g, '');
  let digits = raw.replace(/\D/g, '').slice(0, 8);

  const typingForward = digits.length > prevDigits.length;

  // When backspacing from a trailing auto-hyphen, also drop the last digit
  // so the hyphen doesn't immediately re-appear on the next keystroke.
  if (!typingForward && prev.endsWith('-') && digits.length === prevDigits.length) {
    digits = digits.slice(0, -1);
  }

  const lengths = order.map(p => p === 'year' ? 4 : 2);

  const chunks: string[] = [];
  let pos = 0;
  for (const len of lengths) {
    if (pos >= digits.length) break;
    chunks.push(digits.slice(pos, pos + len));
    pos += len;
  }

  let out = chunks.filter(c => c.length > 0).join('-');

  const lastChunk    = chunks[chunks.length - 1];
  const lastChunkLen = lastChunk ? lengths[chunks.length - 1] : 0;
  const moreRemain   = chunks.length < lengths.length;

  if (typingForward && lastChunk && lastChunk.length === lastChunkLen && moreRemain) {
    out += '-';
  }

  return out;
}

export function dobToISO(masked: string, order: DobPart[]): string | null {
  const digits = masked.replace(/\D/g, '');
  if (digits.length !== 8) return null;

  const lengths = order.map(p => p === 'year' ? 4 : 2);
  const map: Record<DobPart, string> = { day: '', month: '', year: '' };
  let pos = 0;
  for (let i = 0; i < order.length; i++) {
    map[order[i]] = digits.slice(pos, pos + lengths[i]);
    pos += lengths[i];
  }

  const year  = parseInt(map.year,  10);
  const month = parseInt(map.month, 10);
  const day   = parseInt(map.day,   10);

  const currentYear = new Date().getFullYear();

  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1) return null;
  if (year < currentYear - 120) return null;

  // Max days in this month/year — new Date(y, m, 0) gives last day of month m-1
  // where m is 1-indexed, so new Date(y, month, 0) gives last day of `month`.
  const maxDay = new Date(year, month, 0).getDate();
  if (day > maxDay) return null;

  const inputDate = new Date(year, month - 1, day);
  if (inputDate > new Date()) return null;

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function isAdultISO(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number);
  const now   = new Date();
  const todayY = now.getFullYear();
  const todayM = now.getMonth() + 1;
  const todayD = now.getDate();

  const eighteenY = y + 18;

  if (todayY > eighteenY) return true;
  if (todayY < eighteenY) return false;
  if (todayM > m) return true;
  if (todayM < m) return false;
  return todayD >= d;
}
