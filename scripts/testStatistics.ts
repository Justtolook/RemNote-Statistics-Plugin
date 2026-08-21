import assert from 'assert';
import {
    addCalendarDays,
    dateOnlyFromTimestamp,
    filterCardsByRange,
    formatLocalDateOnly,
    getAnalysisRangeCommit,
    getAvailableDateRange,
    getDateAtIndex,
    getMonthMarkers,
    normalizeAnalysisRange,
    updateAnalysisRange,
} from '../src/lib/dateRange';
import { getAnalysisTimestamps } from '../src/lib/dataProcessing';
import {
    emptySection,
    errorSection,
    getCollectionSectionState,
    loadingSection,
    readySection,
} from '../src/lib/statisticsState';

const day = (value: string) => Date.parse(`${value}T12:00:00.000Z`);
const cards = [
    { repetitionHistory: [{ date: day('2024-01-01') }, { date: day('2024-01-03') }] },
    { repetitionHistory: [{ date: day('2024-02-01') }] },
];
const cardsWithInvalidReview = [{ repetitionHistory: [{ date: Number.NaN }, { date: day('2024-01-01') }] }];

const bounds = getAvailableDateRange(cards, '2024-02-02');
assert(bounds);
assert.deepStrictEqual(bounds.days.slice(0, 3), ['2024-01-01', '2024-01-02', '2024-01-03']);
assert.equal(bounds.end, '2024-02-02');
assert.equal(bounds.days.length, 33);
assert.deepStrictEqual(getMonthMarkers(bounds).map(marker => marker.date), ['2024-01-01', '2024-02-01']);
assert.equal(getAvailableDateRange(cards)?.end, formatLocalDateOnly(new Date()));
assert.equal(getAvailableDateRange(cardsWithInvalidReview, new Date(2024, 0, 2, 12))?.start, '2024-01-01');
assert.equal(getAvailableDateRange(cards, new Date(2024, 0, 1, 12))?.end, '2024-02-01');
assert.equal(formatLocalDateOnly(new Date(2024, 0, 2, 23, 30)), '2024-01-02');
assert.equal(dateOnlyFromTimestamp(new Date(2024, 0, 2, 0, 30).getTime()), '2024-01-02');

const normalized = normalizeAnalysisRange({ start: '2023-12-01', end: '2024-03-01' }, bounds);
assert.deepStrictEqual(normalized, { start: '2024-01-01', end: '2024-02-02' });
assert.equal(normalizeAnalysisRange({ start: '2024-02-01', end: '2024-01-01' }, bounds), undefined);

const range = { start: '2024-01-01', end: '2024-01-03' };
assert.deepStrictEqual(updateAnalysisRange(range, bounds, 'start', 0), range);
assert.deepStrictEqual(updateAnalysisRange(range, bounds, 'start', 10), { start: '2024-01-03', end: '2024-01-03' });
assert.deepStrictEqual(updateAnalysisRange(range, bounds, 'end', 2), range);
const draftRange = updateAnalysisRange(range, bounds, 'start', 1);
assert.deepStrictEqual(getAnalysisRangeCommit(range, draftRange), draftRange);
assert.equal(getAnalysisRangeCommit(range, range), undefined);
assert.equal(getAnalysisRangeCommit(range, { ...range }), undefined);
assert.equal(getDateAtIndex(31, bounds), '2024-02-01');
assert.equal(filterCardsByRange(cards, range)[0].repetitionHistory?.length, 2);
assert.equal(filterCardsByRange(cards, range)[1].repetitionHistory?.length, 0);
assert.equal(getAnalysisTimestamps(range).end, Date.parse(`${addCalendarDays(range.end, 1)}T00:00:00.000`) - 1);

assert.deepStrictEqual(loadingSection(), { status: 'loading' });
assert.deepStrictEqual(readySection(['loaded']), { status: 'ready', data: ['loaded'] });
assert.deepStrictEqual(emptySection(), { status: 'empty' });
assert.deepStrictEqual(errorSection('failed'), { status: 'error', error: 'failed' });
assert.equal(getCollectionSectionState(undefined).status, 'loading');
assert.equal(getCollectionSectionState([]).status, 'empty');
assert.equal(getCollectionSectionState(['loaded']).status, 'ready');
assert.equal(getCollectionSectionState(undefined, 'failed').status, 'error');

console.log('statistics pure-function checks passed');
