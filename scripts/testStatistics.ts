import assert from 'assert';
import type { Card, PluginRem } from '@remnote/plugin-sdk';
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
import {
    calculateTimeStatsSummary,
    getAnalysisTimestamps,
    getCumulativeAverageSeries,
    getHardestCards,
    getMovingAverageSeries,
    getNumberRepetitionsGroupedByScore,
    getRecallSpeedPerDay,
    getRepetitionsPerDayOptimized,
    getRetentionRateOverTime,
    getTimeSpentPerDay,
} from '../src/lib/dataProcessing';
import {
    AnalysisDatasetLoaders,
    resolveAnalysisDataset,
} from '../src/widgets/statistics/data/analysisDataset';
import { getComprehensiveContextRems } from '../src/lib/utils';
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

const localDay = (year: number, month: number, date: number) => new Date(year, month - 1, date).getTime();
const localEndOfDay = (year: number, month: number, date: number) => new Date(year, month - 1, date + 1).getTime() - 1;
const localReview = (year: number, month: number, date: number, score: number, responseTime?: number) => ({
    date: new Date(year, month - 1, date, 12).getTime(),
    score,
    ...(responseTime === undefined ? {} : { responseTime }),
});

const scoreCards = [{
    repetitionHistory: [
        localReview(2024, 1, 1, 0.01),
        localReview(2024, 1, 1, 0),
        localReview(2024, 1, 1, 0.5),
        localReview(2024, 1, 1, 1),
        localReview(2024, 1, 1, 1.5),
        localReview(2024, 1, 1, 2),
    ],
}, {
    repetitionHistory: [localReview(2024, 1, 2, 0), localReview(2024, 1, 2, 1)],
}, {
    repetitionHistory: [],
}, {}] as unknown as Card[];
assert.deepStrictEqual(getNumberRepetitionsGroupedByScore(scoreCards), {
    Skip: 1,
    Forgot: 2,
    Hard: 1,
    Good: 2,
    Easy: 1,
});
assert.deepStrictEqual(getNumberRepetitionsGroupedByScore([]), {
    Skip: 0,
    Forgot: 0,
    Hard: 0,
    Good: 0,
    Easy: 0,
});
assert.deepStrictEqual(getNumberRepetitionsGroupedByScore(undefined), {
    Skip: 0,
    Forgot: 0,
    Hard: 0,
    Good: 0,
    Easy: 0,
});

const heatmapStart = localDay(2024, 1, 1);
const heatmapEnd = localEndOfDay(2024, 1, 3);
const heatmapCards = [{
    repetitionHistory: [
        localReview(2016, 12, 31, 1),
        localReview(2024, 1, 1, 1),
        localReview(2024, 1, 3, 1),
        localReview(2024, 1, 4, 1),
    ],
}, {
    repetitionHistory: [localReview(2024, 1, 1, 1)],
}, {}] as unknown as Card[];
assert.deepStrictEqual(
    getRepetitionsPerDayOptimized(heatmapCards, heatmapStart, heatmapEnd),
    [
        { x: localDay(2024, 1, 1), y: 2 },
        { x: localDay(2024, 1, 2), y: 0 },
        { x: localDay(2024, 1, 3), y: 1 },
    ],
);
assert.deepStrictEqual(getRepetitionsPerDayOptimized([], heatmapStart, heatmapEnd), []);
const boundaryHeatmapCards = [...heatmapCards, {
    repetitionHistory: [
        { date: heatmapStart, score: 1 },
        { date: heatmapEnd, score: 1 },
        { date: Number.NaN, score: 1 },
    ],
}] as unknown as Card[];
assert.deepStrictEqual(
    getRepetitionsPerDayOptimized(boundaryHeatmapCards, heatmapStart, heatmapEnd),
    [
        { x: localDay(2024, 1, 1), y: 3 },
        { x: localDay(2024, 1, 2), y: 0 },
        { x: localDay(2024, 1, 3), y: 2 },
    ],
);

const retentionCards = [{
    repetitionHistory: [
        localReview(2024, 1, 1, 1),
        localReview(2024, 1, 1, 0.5),
        localReview(2024, 1, 1, 0),
        localReview(2024, 1, 1, 0.01),
        localReview(2016, 12, 31, 1),
        localReview(2024, 1, 2, 1.5),
        localReview(2024, 1, 2, 0),
        localReview(2024, 1, 4, 0.01),
    ],
}, {
    repetitionHistory: [localReview(2024, 1, 1, 1)],
}] as unknown as Card[];
const retention = getRetentionRateOverTime(retentionCards);
assert.deepStrictEqual(retention, [
    { x: localDay(2024, 1, 1), y: 75 },
    { x: localDay(2024, 1, 2), y: 50 },
]);
assert.deepStrictEqual(getMovingAverageSeries(retention, 2), [
    { x: localDay(2024, 1, 2), y: 62.5 },
]);
assert.deepStrictEqual(getCumulativeAverageSeries(retention), [
    { x: localDay(2024, 1, 1), y: 75 },
    { x: localDay(2024, 1, 2), y: 62.5 },
]);
assert.deepStrictEqual(getRetentionRateOverTime([]), []);
assert.deepStrictEqual(getRetentionRateOverTime(undefined), []);
assert.deepStrictEqual(getMovingAverageSeries([], 1), []);
assert.deepStrictEqual(getMovingAverageSeries(retention, 0), retention);
assert.deepStrictEqual(getMovingAverageSeries(retention, 10), []);
assert.deepStrictEqual(getCumulativeAverageSeries([]), []);

const hardestCards = [
    {
        _id: 'below-minimum',
        remId: 'rem-below-minimum',
        repetitionHistory: [
            localReview(2016, 12, 31, 1),
            localReview(2024, 1, 1, 0),
            localReview(2024, 1, 2, 1),
        ],
    },
    {
        _id: 'hardest',
        remId: 'rem-hardest',
        repetitionHistory: [
            localReview(2024, 1, 1, 0),
            localReview(2024, 1, 2, 0),
            localReview(2024, 1, 3, 1),
        ],
    },
    {
        _id: 'tied-more-forgets',
        remId: 'rem-tied-more-forgets',
        repetitionHistory: [
            localReview(2024, 1, 1, 0),
            localReview(2024, 1, 2, 0),
            localReview(2024, 1, 3, 0),
            localReview(2024, 1, 4, 1),
            localReview(2024, 1, 5, 1),
            localReview(2024, 1, 6, 1),
        ],
    },
    {
        _id: 'tied-fewer-forgets',
        remId: 'rem-tied-fewer-forgets',
        repetitionHistory: [
            localReview(2024, 1, 1, 0),
            localReview(2024, 1, 2, 0),
            localReview(2024, 1, 3, 1),
            localReview(2024, 1, 4, 1.5),
        ],
    },
    {
        _id: 'ignored-scores',
        remId: 'rem-ignored-scores',
        repetitionHistory: [
            localReview(2024, 1, 1, 0.01),
            localReview(2024, 1, 2, 2),
            localReview(2024, 1, 3, 0.01),
        ],
    },
    {
        _id: 'missing-history',
        remId: 'rem-missing-history',
    },
] as unknown as Card[];
const hardest = getHardestCards(hardestCards, 10, 3);
assert.deepStrictEqual(hardest, [
    {
        cardId: 'hardest',
        remId: 'rem-hardest',
        totalReviews: 3,
        forgotCount: 2,
        rememberedCount: 1,
        retentionRate: 33.3,
        lastReviewDate: new Date(2024, 0, 3, 12).getTime(),
    },
    {
        cardId: 'tied-more-forgets',
        remId: 'rem-tied-more-forgets',
        totalReviews: 6,
        forgotCount: 3,
        rememberedCount: 3,
        retentionRate: 50,
        lastReviewDate: new Date(2024, 0, 6, 12).getTime(),
    },
    {
        cardId: 'tied-fewer-forgets',
        remId: 'rem-tied-fewer-forgets',
        totalReviews: 4,
        forgotCount: 2,
        rememberedCount: 2,
        retentionRate: 50,
        lastReviewDate: new Date(2024, 0, 4, 12).getTime(),
    },
]);
assert.deepStrictEqual(getHardestCards(hardestCards, 2).map(card => card.cardId), [
    'hardest',
    'tied-more-forgets',
]);
assert.deepStrictEqual(getHardestCards([]), []);
assert.deepStrictEqual(getHardestCards(undefined), []);

const timeCards = [{
    repetitionHistory: [
        localReview(2016, 12, 31, 1, 999),
        localReview(2024, 1, 1, 1, 1000),
        localReview(2024, 1, 1, 1, 2000),
        localReview(2024, 1, 1, 1, 0),
        localReview(2024, 1, 1, 1),
        localReview(2024, 1, 1, 1, 100000),
        localReview(2024, 1, 2, 1, 3000),
        localReview(2024, 1, 2, 1, 5000),
    ],
}, {
    repetitionHistory: [
        localReview(2024, 1, 1, 1, 4000),
        localReview(2024, 1, 2, 1, 6000),
    ],
}] as unknown as Card[];
const dailyTime = getTimeSpentPerDay(timeCards, heatmapStart, heatmapEnd);
assert.deepStrictEqual(dailyTime, [
    {
        date: localDay(2024, 1, 1),
        timeMs: 107000,
        reviewCount: 4,
        responseTimesMs: [1000, 2000, 100000, 4000],
    },
    {
        date: localDay(2024, 1, 2),
        timeMs: 14000,
        reviewCount: 3,
        responseTimesMs: [3000, 5000, 6000],
    },
]);
assert.deepStrictEqual(getRecallSpeedPerDay(dailyTime), [
    {
        date: localDay(2024, 1, 1),
        averageResponseTimeMs: 3000,
        medianResponseTimeMs: 3000,
        reviewCount: 2,
        totalReviewCount: 4,
    },
    {
        date: localDay(2024, 1, 2),
        averageResponseTimeMs: 5000,
        medianResponseTimeMs: 5000,
        reviewCount: 1,
        totalReviewCount: 3,
    },
]);
assert.deepStrictEqual(getTimeSpentPerDay(timeCards), dailyTime);
assert.deepStrictEqual(
    getTimeSpentPerDay(timeCards, heatmapStart, localEndOfDay(2024, 1, 1)),
    [dailyTime[0]],
);
assert.deepStrictEqual(getRecallSpeedPerDay([
    { date: heatmapStart, timeMs: 0, reviewCount: 0, responseTimesMs: [] },
]), []);
const timeSummary = calculateTimeStatsSummary(dailyTime, heatmapStart, localDay(2024, 1, 3));
assert.equal(timeSummary.totalTimeMs, 121000);
assert.equal(timeSummary.totalReviews, 7);
assert.equal(timeSummary.daysWithReviews, 2);
assert.equal(timeSummary.totalDaysInPeriod, 2);
assert.equal(timeSummary.averageTimePerDay, 60500);
assert.equal(timeSummary.averageTimePerReviewDay, 60500);
assert.equal(timeSummary.averageTimePerCard, 121000 / 7);
assert.equal(timeSummary.cardsPerMinute, 7 / (121000 / 60000));
assert.equal(timeSummary.percentageDaysStudied, 100);
const gappedTime = [dailyTime[0], { ...dailyTime[1], date: localDay(2024, 1, 3) }];
const gappedTimeSummary = calculateTimeStatsSummary(gappedTime, heatmapStart, localDay(2024, 1, 5));
assert.equal(gappedTimeSummary.totalDaysInPeriod, 4);
assert.equal(gappedTimeSummary.daysWithReviews, 2);
assert.equal(gappedTimeSummary.percentageDaysStudied, 50);
assert.deepStrictEqual(getTimeSpentPerDay(undefined), []);
assert.deepStrictEqual(calculateTimeStatsSummary([]), {
    totalTimeMs: 0,
    totalReviews: 0,
    daysWithReviews: 0,
    totalDaysInPeriod: 0,
    averageTimePerDay: 0,
    averageTimePerReviewDay: 0,
    averageTimePerCard: 0,
    cardsPerMinute: 0,
    percentageDaysStudied: 0,
});
assert.deepStrictEqual(calculateTimeStatsSummary([], heatmapStart, localEndOfDay(2024, 1, 5)), {
    totalTimeMs: 0,
    totalReviews: 0,
    daysWithReviews: 0,
    totalDaysInPeriod: 0,
    averageTimePerDay: 0,
    averageTimePerReviewDay: 0,
    averageTimePerCard: 0,
    cardsPerMinute: 0,
    percentageDaysStudied: 0,
});

assert.deepStrictEqual(loadingSection(), { status: 'loading' });
assert.deepStrictEqual(readySection(['loaded']), { status: 'ready', data: ['loaded'] });
assert.deepStrictEqual(emptySection(), { status: 'empty' });
assert.deepStrictEqual(errorSection('failed'), { status: 'error', error: 'failed' });
assert.equal(getCollectionSectionState(undefined).status, 'loading');
assert.equal(getCollectionSectionState([]).status, 'empty');
assert.equal(getCollectionSectionState(['loaded']).status, 'ready');
assert.equal(getCollectionSectionState(undefined, 'failed').status, 'error');

const makeRem = (id: string, methods: Record<string, unknown> = {}) => ({
    _id: id,
    ...methods,
}) as unknown as PluginRem;

const makeCard = (id: string, remId: string) => ({
    _id: id,
    remId,
}) as unknown as Card;

async function runAnalysisDatasetChecks() {
    const contextRem = makeRem('context');
    const emptyLoaders: AnalysisDatasetLoaders = {
        getAllCards: async () => [],
        getDescendants: async () => [],
        getComprehensiveContextRems: async () => [],
        getCards: async () => [],
    };

    assert.deepStrictEqual(
        await resolveAnalysisDataset({ contextMode: 'Global', scopeMode: 'descendants' }, emptyLoaders),
        {},
    );
    const globalCards = [makeCard('global-card', 'global-rem')];
    const global = await resolveAnalysisDataset({
        contextMode: 'Global',
        scopeMode: 'descendants',
        globalCards,
    }, emptyLoaders);
    assert.deepStrictEqual(global.dataset?.cards, globalCards);
    assert.equal(global.dataset?.contextMode, 'Global');
    assert.equal(global.dataset?.contextRemId, undefined);
    assert.deepStrictEqual(
        await resolveAnalysisDataset({ contextMode: 'Current', scopeMode: 'descendants' }, emptyLoaders),
        {},
    );
    const emptyCurrent = await resolveAnalysisDataset({
        contextMode: 'Current',
        scopeMode: 'descendants',
        contextRem,
    }, emptyLoaders);
    assert.deepStrictEqual(emptyCurrent.dataset?.cards, []);

    const descendantRems = [makeRem('descendant-1'), makeRem('descendant-2')];
    let descendantFetches = 0;
    const descendants = await resolveAnalysisDataset({
        contextMode: 'Current',
        scopeMode: 'descendants',
        contextRem,
    }, {
        ...emptyLoaders,
        getDescendants: async () => descendantRems,
        getCards: async rem => {
            descendantFetches += 1;
            return [makeCard(`${rem._id}-card`, rem._id)];
        },
    });
    assert.equal(descendantFetches, 3);
    assert.deepStrictEqual(
        descendants.dataset?.cards.map(card => card._id).sort(),
        ['context-card', 'descendant-1-card', 'descendant-2-card'],
    );

    const sourceRem = makeRem('source');
    const comprehensiveContext = makeRem('context', {
        getDescendants: async () => [descendantRems[0]],
        allRemInDocumentOrPortal: async () => [descendantRems[0], sourceRem],
        allRemInFolderQueue: async () => [sourceRem],
        getSources: async () => [],
        remsReferencingThis: async () => [descendantRems[0]],
    });
    let comprehensiveFetches = 0;
    const comprehensive = await resolveAnalysisDataset({
        contextMode: 'Current',
        scopeMode: 'comprehensive',
        contextRem: comprehensiveContext,
    }, {
        ...emptyLoaders,
        getComprehensiveContextRems,
        getCards: async rem => {
            comprehensiveFetches += 1;
            return [makeCard(`${rem._id}-card`, rem._id)];
        },
    });
    assert.equal(comprehensiveFetches, 3);
    assert.deepStrictEqual(
        comprehensive.dataset?.cards.map(card => card.remId).sort(),
        ['context', 'descendant-1', 'source'],
    );

    const largeRems = Array.from({ length: 201 }, (_, index) => makeRem(`large-${index}`));
    let bulkFetches = 0;
    let iterativeFetches = 0;
    const largeScope = await resolveAnalysisDataset({
        contextMode: 'Current',
        scopeMode: 'comprehensive',
        contextRem,
    }, {
        ...emptyLoaders,
        getComprehensiveContextRems: async () => largeRems,
        getAllCards: async () => {
            bulkFetches += 1;
            return [
                makeCard('scoped-card', 'large-200'),
                makeCard('outside-card', 'outside'),
            ];
        },
        getCards: async () => {
            iterativeFetches += 1;
            return [];
        },
    });
    assert.deepStrictEqual(largeScope.dataset?.cards.map(card => card._id), ['scoped-card']);
    assert.equal(iterativeFetches, 0);
    assert.equal(bulkFetches, 1);

    const rejected = await resolveAnalysisDataset({
        contextMode: 'Current',
        scopeMode: 'descendants',
        contextRem,
    }, {
        ...emptyLoaders,
        getDescendants: async () => [contextRem],
        getCards: async () => { throw new Error('fixture failure'); },
    });
    assert.deepStrictEqual(rejected.dataset?.cards, []);
    assert.equal(rejected.error, 'The selected Rem scope could not be loaded.');
}

console.log('statistics pure-function checks passed');
runAnalysisDatasetChecks()
    .then(() => console.log('analysis dataset checks passed'))
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
