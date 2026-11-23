import { startOfLocalWeek } from './calendar';

export type RangeMode = 'Today' | 'Yesterday' | 'Week' | 'This Week' | 'Last Week' | 'Month' | 'This Month' | 'Last Month' | 'Year' | 'This Year' | 'Last Year' | 'All';

/** Start and end date of a preset period. Returns undefined for "All". */
export function getPresetRange(mode: RangeMode, today: Date, weekStartsOn: number): { start: Date; end: Date } | undefined {
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  const daysAgo = (days: number) => { const d = new Date(t); d.setDate(d.getDate() - days); return d; };

  switch (mode) {
    case 'Today': return { start: t, end: t };
    case 'Yesterday': return { start: daysAgo(1), end: daysAgo(1) };
    case 'Week': return { start: daysAgo(7), end: t };
    case 'This Week': return { start: startOfLocalWeek(t, weekStartsOn), end: t };
    case 'Last Week': {
      const thisWeek = startOfLocalWeek(t, weekStartsOn);
      const end = new Date(thisWeek); end.setDate(end.getDate() - 1);
      const start = new Date(thisWeek); start.setDate(start.getDate() - 7);
      return { start, end };
    }
    case 'Month': return { start: daysAgo(30), end: t };
    case 'This Month': return { start: new Date(t.getFullYear(), t.getMonth(), 1), end: t };
    case 'Last Month': return { start: new Date(t.getFullYear(), t.getMonth() - 1, 1), end: new Date(t.getFullYear(), t.getMonth(), 0) };
    case 'Year': return { start: daysAgo(365), end: t };
    case 'This Year': return { start: new Date(t.getFullYear(), 0, 1), end: t };
    case 'Last Year': return { start: new Date(t.getFullYear() - 1, 0, 1), end: new Date(t.getFullYear() - 1, 11, 31) };
    case 'All': return undefined;
  }
}
