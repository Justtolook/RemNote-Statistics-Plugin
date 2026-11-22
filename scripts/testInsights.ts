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
import {
    getFatigueCurve,
    getForgettingCurve,
    getGradedReviewDates,
    getSpacedReviews,
    SpacedReview,
} from '../src/lib/insights';

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

// --- Spaced reviews ---------------------------------------------------------

const spaced = getSpacedReviews(asCards([{
    _id: 'sp',
    remId: 'r',
    repetitionHistory: [
        review(at(2, 20), ReviewScore.GOOD), // out of order on purpose: interval 18 from 2 Feb
        review(at(1, 31, 9), ReviewScore.GOOD), // first review: not spaced
        review(at(1, 31, 18), ReviewScore.FORGOT), // same day: not spaced
        review(at(2, 2), ReviewScore.FORGOT, 7000), // interval 2
        review(at(2, 3), ReviewScore.SKIP), // not a review
    ],
}]));
assert.deepStrictEqual(spaced.map(r => [r.intervalDays, r.recalled, r.responseTime]), [[2, false, 7000], [18, true, undefined]]);
assert.equal(getSpacedReviews(asCards([{ repetitionHistory: [review(at(1, 1), 1), review(at(1, 5), 1)] }]), midnight(1, 6)).length, 0);
assert.equal(getGradedReviewDates(mixedCards).length, 2);

// --- Forgetting curve -----------------------------------------------------

const makeSpaced = (count: number, intervalDays: number, forgetEvery: number): SpacedReview[] =>
    Array.from({ length: count }, (_, i) => ({ date: at(1, 1) + i, intervalDays, recalled: (i + 1) % forgetEvery !== 0 }));
const curveReviews = [
    ...makeSpaced(30, 1, 1000), // 100%
    ...makeSpaced(30, 5, 15), // 28/30 = 93.3%
    ...makeSpaced(30, 20, 1000).map((r, i) => ({ ...r, recalled: i >= 9 })), // 21/30 = 70%
    ...makeSpaced(5, 100, 1000), // too few to judge
];
const curve = getForgettingCurve(curveReviews, 90);
assert.deepStrictEqual(curve.buckets.map(b => b.label), ['1 day', '2–3 days', '4–7 days', '8–14 days', '15–30 days', '31–60 days', '61–120 days']);
assert.deepStrictEqual(curve.buckets.map(b => b.total), [30, 0, 30, 0, 30, 0, 5]);
assert.deepStrictEqual(curve.buckets.map(b => b.retentionRate), [100, undefined, 93.3, undefined, 70, undefined, 100]);
assert.equal(curve.buckets[6].reliable, false);
assert.equal(curve.verdict.kind, 'below-target');
if (curve.verdict.kind === 'below-target') {
    assert.equal(curve.verdict.lastOnTarget?.label, '4–7 days');
    assert.equal(curve.verdict.firstBelow.label, '15–30 days');
}
const aboveCurve = getForgettingCurve(curveReviews.filter(r => r.intervalDays < 10), 90);
assert.equal(aboveCurve.verdict.kind, 'on-target');
if (aboveCurve.verdict.kind === 'on-target') {
    assert.equal(aboveCurve.verdict.longestReliable.label, '4–7 days');
    assert.equal(aboveCurve.verdict.allAbove, true);
}
// 26 of 30 (86.7%) is below a 90% target, but within chance: not a verdict of "below".
const dipCurve = getForgettingCurve([...makeSpaced(30, 1, 1000).map((r, i) => ({ ...r, recalled: i >= 4 })), ...makeSpaced(30, 5, 1000)], 90);
assert.deepStrictEqual([dipCurve.verdict.kind, dipCurve.verdict.kind === 'on-target' && dipCurve.verdict.allAbove], ['on-target', false]);
assert.equal(getForgettingCurve(makeSpaced(5, 3, 1000), 90).verdict.kind, 'not-enough-data');
assert.deepStrictEqual(getForgettingCurve([], 90), { buckets: [], verdict: { kind: 'not-enough-data' } });

// --- Fatigue curve --------------------------------------------------------

// Ten 40-minute sessions on different days, one review every 30 seconds.
// Before minute 25 one answer in 10 is wrong (90%); afterwards 3 in 10 (70%) and 50% slower.
// Errors are spread evenly so every 5-minute bucket has the same rate.
function makeSessions(dropAt: number | undefined) {
    const allDates: number[] = [];
    const reviews: SpacedReview[] = [];
    for (let day = 0; day < 10; day++) {
        const sessionStart = at(3, 1 + day, 18);
        for (let i = 0; i < 80; i++) {
            const date = sessionStart + i * 30000;
            const minute = i / 2;
            const tired = dropAt !== undefined && minute >= dropAt;
            allDates.push(date);
            reviews.push({
                date,
                intervalDays: 3,
                recalled: tired ? i % 10 >= 3 : i % 10 !== 0,
                responseTime: tired ? 6000 : 4000,
            });
        }
    }
    return { allDates, reviews };
}
const tiredSessions = makeSessions(25);
const fatigue = getFatigueCurve(tiredSessions.reviews, tiredSessions.allDates);
assert.deepStrictEqual(fatigue.sessions, { sessions: 10, medianDurationMinutes: 39.5, medianReviews: 80 });
assert.deepStrictEqual(fatigue.buckets.map(b => b.label), ['0–5 min', '5–10 min', '10–15 min', '15–20 min', '20–25 min', '25–30 min', '30–35 min', '35–40 min']);
assert.deepStrictEqual(fatigue.verdict, {
    kind: 'drop',
    afterMinute: 25,
    baselineRate: 90,
    droppedRate: 70,
    slowdownPercent: 50,
    sessionsLongerShare: 100,
});
const freshSessions = makeSessions(undefined);
const noFatigue = getFatigueCurve(freshSessions.reviews, freshSessions.allDates);
assert.deepStrictEqual(noFatigue.verdict, { kind: 'no-drop', testedUpToMinute: 40, baselineRate: 90 });
// A pause of more than 10 minutes starts a new session.
const split = getFatigueCurve([], [at(4, 1, 10), at(4, 1, 10) + 9 * 60000, at(4, 1, 10) + 20 * 60000]);
assert.equal(split.sessions.sessions, 2);
assert.deepStrictEqual(getFatigueCurve([], []).verdict, { kind: 'not-enough-data' });

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
