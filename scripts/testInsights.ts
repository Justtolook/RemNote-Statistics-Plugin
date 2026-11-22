/**
 * Checks for the forecast, retention, leech and breakdown logic.
 * Run with TZ=Europe/Berlin (see package.json) so the daylight-saving change on
 * 25 Oct 2026 is exercised.
 */
import assert from 'assert';
import type { Card } from '@remnote/plugin-sdk';
import {
    buildDailyReviewBuckets,
    calculateTimeStatsSummary,
    countGradedReviews,
    getAnalysisTimestamps,
    getDueForecast,
    getFutureDueCards,
    getHardestCards,
    getNumberCardsGroupedByRepetitions,
    getRepetitionsPerDayOptimized,
    getRetentionByMaturity,
    getTimeSpentPerDay,
    getTypicalResponseTime,
    getWeightedCumulativeRetention,
    getWeightedRetentionMovingAverage,
    wilsonUpperBound,
} from '../src/lib/dataProcessing';
import { getGroupBreakdown, loadParentMap, OUTSIDE_GROUP, resolveGroupIds } from '../src/lib/breakdown';
import { getLocaleWeekStart } from '../src/lib/calendar';
import { getPresetRange } from '../src/lib/presetRanges';
import { formatLocalDateOnly } from '../src/lib/dateRange';
import { ReviewScore } from '../src/lib/reviewScores';
import { readNumberSetting } from '../src/lib/settings';

assert.equal(
    new Date(2026, 9, 24, 12).getTimezoneOffset() !== new Date(2026, 9, 26, 12).getTimezoneOffset(),
    true,
    'these checks must run in a time zone with a DST change on 25 Oct 2026 (TZ=Europe/Berlin)',
);

const at = (month: number, day: number, hour = 12, year = 2026) => new Date(year, month - 1, day, hour).getTime();
const midnight = (month: number, day: number, year = 2026) => new Date(year, month - 1, day).getTime();
const review = (date: number, score: number, responseTime?: number) => ({
    date,
    score,
    ...(responseTime === undefined ? {} : { responseTime }),
});
const asCards = (cards: unknown[]) => cards as Card[];

// --- Forecast: daylight saving and backlog --------------------------------

const now = at(10, 20, 10);
const forecastCards: unknown[] = [];
for (let offset = 0; offset < 10; offset++) {
    for (let k = 0; k <= offset; k++) {
        forecastCards.push({ _id: `f${offset}-${k}`, remId: 'r', nextRepetitionTime: at(10, 20 + offset, 15), repetitionHistory: [] });
    }
}
// Reviewed card due earlier today, and one due last week: both are backlog.
forecastCards.push({ _id: 'overdue-today', remId: 'r', nextRepetitionTime: at(10, 20, 8), repetitionHistory: [review(at(10, 10), 1)] });
forecastCards.push({ _id: 'overdue-old', remId: 'r', nextRepetitionTime: at(10, 13), repetitionHistory: [review(at(10, 1), 0)] });
// New card that was never reviewed: not backlog.
forecastCards.push({ _id: 'new', remId: 'r', nextRepetitionTime: at(10, 1), repetitionHistory: [] });

const forecast = getDueForecast(asCards(forecastCards), 10, now);
assert.equal(forecast.days.length, 10);
assert.deepStrictEqual(
    forecast.days.map(day => new Date(day.date).getHours()),
    Array(10).fill(0),
    'every forecast day starts at local midnight, also after the DST change',
);
assert.deepStrictEqual(
    forecast.days.map(day => formatLocalDateOnly(new Date(day.date))),
    Array.from({ length: 10 }, (_, i) => `2026-10-${String(20 + i).padStart(2, '0')}`),
);
assert.deepStrictEqual(forecast.days.map(day => day.due), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
assert.equal(forecast.overdueCount, 2);
assert.deepStrictEqual(forecast.days.map(day => day.overdue), [2, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
assert.deepStrictEqual(getFutureDueCards(asCards(forecastCards), 2, now), [[midnight(10, 20), 3], [midnight(10, 21), 2]]);
assert.deepStrictEqual(getDueForecast(undefined, 0, now), { days: [], overdueCount: 0 });

// --- Heatmap across the DST change ---------------------------------------

const dstCards = asCards([{ _id: 'c', remId: 'r', repetitionHistory: [review(at(10, 24), 1), review(at(10, 26), 1), review(at(10, 27, 23), 0)] }]);
assert.deepStrictEqual(
    getRepetitionsPerDayOptimized(dstCards, midnight(10, 24), midnight(10, 28) - 1),
    [
        { x: midnight(10, 24), y: 1 },
        { x: midnight(10, 25), y: 0 },
        { x: midnight(10, 26), y: 1 },
        { x: midnight(10, 27), y: 1 },
    ],
);

// --- Skips and schedule edits are not reviews ----------------------------

const mixedCards = asCards([{
    _id: 'm',
    remId: 'r',
    repetitionHistory: [
        review(at(3, 1), ReviewScore.SKIP),
        review(at(3, 1), ReviewScore.GOOD),
        review(at(3, 2), ReviewScore.FORGOT),
        review(at(3, 2), ReviewScore.RESET),
        review(at(3, 3), ReviewScore.VIEWED_AS_LEECH),
    ],
}]);
assert.equal(countGradedReviews(mixedCards), 2);
assert.deepStrictEqual(getNumberCardsGroupedByRepetitions(mixedCards), [{ x: 2, y: 1 }]);
const mixedBuckets = buildDailyReviewBuckets(mixedCards);
assert.deepStrictEqual(mixedBuckets.map(day => [day.reviews, day.skipped]), [[1, 1], [1, 0]]);

// --- Retention moving averages use calendar days and weights ------------

const retentionCounts = [
    { x: midnight(1, 1), remembered: 9, forgot: 1 },
    { x: midnight(1, 2), remembered: 0, forgot: 1 },
    { x: midnight(1, 7), remembered: 1, forgot: 0 },
    { x: midnight(1, 20), remembered: 0, forgot: 2 },
];
assert.deepStrictEqual(getWeightedRetentionMovingAverage(retentionCounts, 7), [
    // 1-7 Jan: 10 of 12 remembered. The unweighted mean of the days would be 63.3%.
    { x: midnight(1, 7), y: 83.3 },
    // 14-20 Jan: only the 20th falls in the window.
    { x: midnight(1, 20), y: 0 },
]);
assert.deepStrictEqual(getWeightedRetentionMovingAverage(retentionCounts, 30), [], 'no point before the window is covered');
assert.deepStrictEqual(getWeightedCumulativeRetention(retentionCounts).map(point => point.y), [90, 81.8, 83.3, 71.4]);

// --- Time-period length uses an exclusive end ----------------------------

const range = { start: '2026-01-01', end: '2026-01-03' };
const { start: rangeStart, end: rangeEnd } = getAnalysisTimestamps(range);
const timed = getTimeSpentPerDay(asCards([{ _id: 't', remId: 'r', repetitionHistory: [review(at(1, 1), 1, 5000)] }]), rangeStart, rangeEnd);
assert.equal(calculateTimeStatsSummary(timed, rangeStart, rangeEnd + 1).totalDaysInPeriod, 3);

// --- Hardest cards rank by confidence and flag leeches -------------------

assert.ok(wilsonUpperBound(5, 50) < wilsonUpperBound(0, 3));
const repeat = (count: number, score: number, startDay: number) =>
    Array.from({ length: count }, (_, i) => review(at(2, 1) + (startDay + i) * 86400000, score));
const hardCards = asCards([
    { _id: 'small-sample', remId: 'a', repetitionHistory: repeat(3, 0, 0) },
    { _id: 'consistently-bad', remId: 'b', repetitionHistory: [...repeat(45, 0, 0), ...repeat(5, 1, 45)] },
    { _id: 'marked-leech', remId: 'c', repetitionHistory: [...repeat(1, 0, 0), ...repeat(3, 1, 1), review(at(3, 1), ReviewScore.VIEWED_AS_LEECH)] },
]);
const hardest = getHardestCards(hardCards, 10, 3, 8);
assert.deepStrictEqual(hardest.map(card => card.cardId), ['consistently-bad', 'small-sample', 'marked-leech']);
assert.deepStrictEqual(hardest.map(card => card.isLeech), [true, false, true]);

// --- Young vs mature retention ------------------------------------------

const maturityCards = asCards([{
    _id: 'mat',
    remId: 'r',
    repetitionHistory: [
        review(at(1, 30), ReviewScore.GOOD), // day 30: interval 27 -> mature, out of order on purpose
        review(at(1, 1, 9), ReviewScore.GOOD), // first review -> learning
        review(at(1, 1, 18), ReviewScore.FORGOT), // same day -> learning
        review(at(1, 3), ReviewScore.FORGOT), // interval 2 -> young
        review(at(1, 31), ReviewScore.SKIP), // ignored
    ],
}]);
const maturity = getRetentionByMaturity(maturityCards);
assert.deepStrictEqual(maturity.young, { remembered: 0, forgot: 1, total: 1, retentionRate: 0 });
assert.deepStrictEqual(maturity.mature, { remembered: 1, forgot: 0, total: 1, retentionRate: 100 });
assert.equal(maturity.learningReviews, 2);
const lateOnly = getRetentionByMaturity(maturityCards, midnight(1, 10), Infinity);
assert.equal(lateOnly.mature.total, 1, 'the interval is measured from a review before the period');
assert.equal(lateOnly.young.total + lateOnly.learningReviews, 0);

// --- Typical response time ------------------------------------------------

const speedCards = asCards([{
    _id: 's',
    remId: 'r',
    repetitionHistory: [
        review(at(10, 1), 1, 4000),
        review(at(10, 2), 1, 6000),
        review(at(10, 3), 0, 300000), // capped to 60s
        review(at(1, 1), 1, 1000), // older than 30 days
        review(at(10, 4), ReviewScore.SKIP, 100), // not a review
    ],
}]);
assert.equal(getTypicalResponseTime(speedCards, at(10, 20)), 6000);
assert.equal(getTypicalResponseTime(speedCards, at(12, 31)), 5000, 'falls back to all history');
assert.equal(getTypicalResponseTime([], now), undefined);

// --- Preset ranges and week start ----------------------------------------

const wednesday = new Date(2026, 10, 18, 15); // Wed 18 Nov 2026
const thisWeekMonday = getPresetRange('This Week', wednesday, 1)!;
assert.equal(formatLocalDateOnly(thisWeekMonday.start), '2026-11-16');
const lastWeekMonday = getPresetRange('Last Week', wednesday, 1)!;
assert.deepStrictEqual([formatLocalDateOnly(lastWeekMonday.start), formatLocalDateOnly(lastWeekMonday.end)], ['2026-11-09', '2026-11-15']);
const thisWeekSunday = getPresetRange('This Week', wednesday, 0)!;
assert.equal(formatLocalDateOnly(thisWeekSunday.start), '2026-11-15');
assert.equal(getPresetRange('All', wednesday, 1), undefined);
assert.equal(getLocaleWeekStart('de-DE'), 1);
const intlLocale = (Intl as any).Locale ? new (Intl as any).Locale('en-US') : undefined;
if (intlLocale && (intlLocale.weekInfo || intlLocale.getWeekInfo)) {
    assert.equal(getLocaleWeekStart('en-US'), 0);
}

// --- Settings parsing -----------------------------------------------------

assert.equal(readNumberSetting(undefined, 90, 1, 100), 90);
assert.equal(readNumberSetting('85', 90, 1, 100), 85);
assert.equal(readNumberSetting(150, 90, 1, 100), 90);
assert.equal(readNumberSetting(0, 60, 0, 600), 0);

// --- Breakdown ------------------------------------------------------------

async function runBreakdownChecks() {
    // Tree:  docA -> childA1 -> leaf1 ; docA -> childA2 ; docB -> leaf2 ; orphan (deleted)
    const tree: Record<string, string | null> = {
        docA: null, childA1: 'docA', leaf1: 'childA1', childA2: 'docA', docB: null, leaf2: 'docB',
    };
    const calls: string[][] = [];
    const parents = await loadParentMap(['leaf1', 'childA2', 'leaf2', 'leaf1', 'orphan'], async ids => {
        calls.push(ids);
        return ids.filter(id => id in tree).map(id => ({ _id: id, parent: tree[id] }));
    }, 2);
    assert.equal(parents.get('leaf1'), 'childA1');
    assert.equal(parents.get('orphan'), null, 'missing Rems are treated as top level');
    assert.deepStrictEqual(calls.flat().sort(), ['childA1', 'childA2', 'docA', 'docB', 'leaf1', 'leaf2', 'orphan'].sort(), 'each Rem is fetched once');

    const remIds = ['leaf1', 'childA2', 'leaf2', 'orphan', 'docA'];
    assert.deepStrictEqual(Object.fromEntries(resolveGroupIds(remIds, parents)), {
        leaf1: 'docA', childA2: 'docA', leaf2: 'docB', orphan: 'orphan', docA: 'docA',
    });
    // Resolving a descendant first must not poison the context Rem's own entry, and vice versa.
    assert.deepStrictEqual(Object.fromEntries(resolveGroupIds(['leaf1', 'docA', 'childA2', 'leaf2'], parents, 'docA')), {
        leaf1: 'childA1', docA: 'docA', childA2: 'childA2', leaf2: OUTSIDE_GROUP,
    });
    assert.deepStrictEqual(Object.fromEntries(resolveGroupIds(['docA', 'leaf1'], parents, 'docA')), {
        docA: 'docA', leaf1: 'childA1',
    });

    const cards = asCards([
        { _id: 'c1', remId: 'leaf1', repetitionHistory: [review(at(5, 1), 1, 4000), review(at(5, 2), 0, 120000)] },
        { _id: 'c2', remId: 'childA2', repetitionHistory: [...repeat(8, 0, 0)] },
        { _id: 'c3', remId: 'leaf2', repetitionHistory: [review(at(5, 1), 1)] },
        { _id: 'c4', remId: 'leaf2', repetitionHistory: [] },
    ]);
    const breakdown = getGroupBreakdown(cards, resolveGroupIds(remIds, parents), 0, Infinity, 8);
    assert.deepStrictEqual(breakdown, [
        { groupId: 'docA', cards: 2, reviews: 10, remembered: 1, forgot: 9, timeMs: 64000, leeches: 1, retentionRate: 10 },
        { groupId: 'docB', cards: 2, reviews: 1, remembered: 1, forgot: 0, timeMs: 0, leeches: 0, retentionRate: 100 },
    ]);
}

runBreakdownChecks()
    .then(() => console.log('insight checks passed'))
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
