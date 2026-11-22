/**
 * Local-calendar helpers. Days are always stepped with `setDate(+1)` instead of
 * adding 24 hours, so daylight-saving changes never shift a day.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight (local time) of the day containing `timestamp`. */
export function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Midnight (local time) `amount` calendar days after the day containing `timestamp`. */
export function addLocalDays(timestamp: number, amount: number): number {
  const date = new Date(startOfLocalDay(timestamp));
  date.setDate(date.getDate() + amount);
  return date.getTime();
}

/** Every local midnight from the day of `start` through the day of `end`, inclusive. */
export function eachLocalDay(start: number, end: number): number[] {
  const days: number[] = [];
  const current = new Date(startOfLocalDay(start));
  const last = startOfLocalDay(end);
  while (current.getTime() <= last) {
    days.push(current.getTime());
    current.setDate(current.getDate() + 1);
  }
  return days;
}

/** Number of calendar days between two timestamps' days (b - a), ignoring DST. */
export function calendarDayDiff(a: number, b: number): number {
  const da = new Date(a);
  const db = new Date(b);
  const utcA = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const utcB = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((utcB - utcA) / DAY_MS);
}

/**
 * First day of the week for the user's locale, as a JS weekday (0 = Sunday,
 * 1 = Monday, ...). Uses `Intl.Locale#weekInfo` where available and falls back
 * to Monday (ISO 8601).
 */
export function getLocaleWeekStart(locale?: string): number {
  try {
    const tag = locale ?? (typeof navigator !== 'undefined' ? navigator.language : undefined);
    if (tag && typeof Intl !== 'undefined' && 'Locale' in Intl) {
      const info = new (Intl as any).Locale(tag);
      const weekInfo = info.weekInfo ?? info.getWeekInfo?.();
      if (weekInfo && typeof weekInfo.firstDay === 'number') {
        return weekInfo.firstDay % 7; // Intl uses 1..7 with 7 = Sunday
      }
    }
  } catch {
    // Fall through to the default.
  }
  return 1;
}

/** Local midnight of the first day of the week containing `date`. */
export function startOfLocalWeek(date: Date, weekStartsOn: number): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const offset = (result.getDay() - weekStartsOn + 7) % 7;
  result.setDate(result.getDate() - offset);
  return result;
}
