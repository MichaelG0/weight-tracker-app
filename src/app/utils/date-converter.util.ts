const pad = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" for the calendar day as written (strings) or as seen locally (Date objects). */
export function toDateKey(date: Date | string): string {
  if (typeof date === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date.trim());
    if (!m) throw new Error(`Invalid date string: ${date}`);
    return `${m[1]}-${m[2]}-${m[3]}`;
  }
  if (Number.isNaN(date.getTime())) throw new Error('Invalid Date');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Normalizes any date/ISO string to that calendar day, stored as a
 * timezone-free local timestamp string (no Z, no UTC conversion).
 * e.g. "2026-08-15T15:15:11.505Z" → "2026-08-15T00:00:00"
 * Use this for storing dates in the database, and for comparing dates without worrying about timezones.
 */
export function toLocalMidnightString(date: Date | string): string {
  return `${toDateKey(date)}T00:00:00`;
}

export function todayLocalMidnightString(): string {
  return toLocalMidnightString(new Date());
}

export function todayLocalMidnightDate(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function todayLocalMidnightMs(): number {
  return todayLocalMidnightDate().getTime();
}

/** Whole days since epoch for a calendar date. DST-proof, for date arithmetic. */
export function dateKeyToDayNumber(date: string): number {
  const [y, m, d] = date.substring(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}
