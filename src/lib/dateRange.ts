export type DateOnly = string;

export interface AnalysisRange {
    start: DateOnly;
    end: DateOnly;
}

export interface AvailableDateRange {
    start: DateOnly;
    end: DateOnly;
    days: DateOnly[];
}

export interface MonthMarker {
    date: DateOnly;
    label: string;
    index: number;
}

export interface ReviewHistorySource {
    repetitionHistory?: Array<{ date: number }> | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(value: string): boolean {
    if (!DATE_ONLY_PATTERN.test(value)) return false;

    const date = parseDateOnly(value);
    return formatDateOnly(date) === value;
}

export function parseDateOnly(value: DateOnly): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
}

export function formatDateOnly(date: Date): DateOnly {
    return date.toISOString().slice(0, 10);
}

export function dateOnlyFromTimestamp(timestamp: number): DateOnly {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function dateOnlyToTimestamp(value: DateOnly): number {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day).getTime();
}

export function addCalendarDays(value: DateOnly, amount: number): DateOnly {
    const date = parseDateOnly(value);
    date.setUTCDate(date.getUTCDate() + amount);
    return formatDateOnly(date);
}

export function compareDateOnly(left: DateOnly, right: DateOnly): number {
    return left.localeCompare(right);
}

export function getCalendarDays(start: DateOnly, end: DateOnly): DateOnly[] {
    if (!isDateOnly(start) || !isDateOnly(end) || compareDateOnly(start, end) > 0) {
        return [];
    }

    const days: DateOnly[] = [];
    let current = start;
    while (compareDateOnly(current, end) <= 0) {
        days.push(current);
        current = addCalendarDays(current, 1);
    }
    return days;
}

export function getAvailableDateRange(cards: ReviewHistorySource[]): AvailableDateRange | undefined {
    const reviewDays = cards
        .flatMap(card => (card.repetitionHistory || [])
            .filter(review => Number.isFinite(review.date) && !Number.isNaN(new Date(review.date).getTime()))
            .map(review => dateOnlyFromTimestamp(review.date)))
        .sort();

    if (reviewDays.length === 0) return undefined;

    const start = reviewDays[0];
    const end = reviewDays[reviewDays.length - 1];
    return { start, end, days: getCalendarDays(start, end) };
}

export function normalizeAnalysisRange(
    range: Partial<AnalysisRange>,
    bounds?: AvailableDateRange
): AnalysisRange | undefined {
    if (!range.start || !range.end || !isDateOnly(range.start) || !isDateOnly(range.end)) {
        return undefined;
    }

    const start = bounds ? clampDateOnly(range.start, bounds.start, bounds.end) : range.start;
    const end = bounds ? clampDateOnly(range.end, bounds.start, bounds.end) : range.end;
    if (compareDateOnly(start, end) > 0) return undefined;
    return { start, end };
}

export function clampDateOnly(value: DateOnly, min: DateOnly, max: DateOnly): DateOnly {
    if (compareDateOnly(value, min) < 0) return min;
    if (compareDateOnly(value, max) > 0) return max;
    return value;
}

export function getDateIndex(value: DateOnly, bounds: AvailableDateRange): number {
    const clamped = clampDateOnly(value, bounds.start, bounds.end);
    return Math.max(0, Math.round((parseDateOnly(clamped).getTime() - parseDateOnly(bounds.start).getTime()) / DAY_MS));
}

export function getDateAtIndex(index: number, bounds: AvailableDateRange): DateOnly {
    const safeIndex = Math.min(Math.max(Math.round(index), 0), bounds.days.length - 1);
    return bounds.days[safeIndex];
}

export function updateAnalysisRange(
    range: AnalysisRange,
    bounds: AvailableDateRange,
    handle: 'start' | 'end',
    index: number
): AnalysisRange {
    const nextIndex = Math.min(Math.max(Math.round(index), 0), bounds.days.length - 1);
    const startIndex = getDateIndex(range.start, bounds);
    const endIndex = getDateIndex(range.end, bounds);
    const nextStartIndex = handle === 'start' ? Math.min(nextIndex, endIndex) : startIndex;
    const nextEndIndex = handle === 'end' ? Math.max(nextIndex, startIndex) : endIndex;
    return {
        start: getDateAtIndex(nextStartIndex, bounds),
        end: getDateAtIndex(nextEndIndex, bounds),
    };
}

export function getMonthMarkers(bounds?: AvailableDateRange): MonthMarker[] {
    if (!bounds) return [];

    return bounds.days
        .map((date, index) => ({ date, index }))
        .filter(({ date }) => date.slice(8) === '01')
        .map(({ date, index }) => ({
            date,
            index,
            label: parseDateOnly(date).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' }),
        }));
}

export function filterCardsByRange<T extends ReviewHistorySource>(
    cards: T[],
    range?: AnalysisRange
): T[] {
    if (!range) return cards;

    const start = dateOnlyToTimestamp(range.start);
    const endExclusive = dateOnlyToTimestamp(addCalendarDays(range.end, 1));

    return cards.map(card => {
        const filteredHistory = (card.repetitionHistory || []).filter(review => review.date >= start && review.date < endExclusive);
        const copy = Object.assign(Object.create(Object.getPrototypeOf(card)), card) as T;
        copy.repetitionHistory = filteredHistory;
        return copy;
    });
}

export function getDateRangeLabel(range?: AnalysisRange): string {
    if (!range) return 'All available days';
    return `${range.start} – ${range.end}`;
}

export function getAnalysisRangeCommit(
    committedRange: AnalysisRange,
    draftRange: AnalysisRange
): AnalysisRange | undefined {
    if (committedRange.start === draftRange.start && committedRange.end === draftRange.end) {
        return undefined;
    }

    return draftRange;
}
