/**
 * Normalizes any date/ISO string to that calendar day, stored as a
 * timezone-free local timestamp string (no Z, no UTC conversion).
 * e.g. "2026-08-15T15:15:11.505Z" → "2026-08-15T00:00:00"
 * Use this for storing dates in the database, and for comparing dates without worrying about timezones.
 */
export function toLocalMidnightString(date: Date | string): string {
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00:00`;
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
