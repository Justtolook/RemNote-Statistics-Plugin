import { Card } from '@remnote/plugin-sdk';
import { AnalysisRange, addCalendarDays, dateOnlyToTimestamp } from './dateRange';
import { addLocalDays, calendarDayDiff, eachLocalDay, startOfLocalDay } from './calendar';
import {
  getScoreName,
  isForgot,
  isGradedReview,
  isRecall,
  isValidReviewDate,
  ReviewScore,
  ScoreName,
} from './reviewScores';

type ReviewLike = { date: number; score?: number; responseTime?: number };
type CardLike = Pick<Card, '_id' | 'remId'> & {
  repetitionHistory?: ReviewLike[] | null;
  nextRepetitionTime?: number;
};

/**
 * Single answers longer than this are capped when adding up time spent, so a
 * card left open while you walk away does not count as 20 minutes of study.
 * Anki uses the same default.
 */
export const DEFAULT_MAX_RESPONSE_TIME_MS = 60_000;

/** Interval (days since the previous review) at which a card counts as mature. */
export const MATURE_INTERVAL_DAYS = 21;

/** Lapses within the analysed period at which a card is flagged as a leech. */
export const DEFAULT_LEECH_THRESHOLD = 8;

export function getAnalysisTimestamps(range?: AnalysisRange): { start: number; end: number } {
  if (!range) return { start: 0, end: Infinity };
  return {
    start: dateOnlyToTimestamp(range.start),
    // Existing processors treat the end limit as inclusive.
    end: dateOnlyToTimestamp(addCalendarDays(range.end, 1)) - 1,
  };
}

export function capResponseTime(responseTime: number, capMs: number = DEFAULT_MAX_RESPONSE_TIME_MS): number {
  return capMs > 0 ? Math.min(responseTime, capMs) : responseTime;
}

// ---------------------------------------------------------------------------
// Daily buckets: one pass over the review history that most charts derive from
// ---------------------------------------------------------------------------

export interface DailyReviewBucket {
  date: number; // local midnight
  reviews: number; // graded reviews (Forgot/Hard/Good/Easy)
  forgot: number;
  remembered: number;
  skipped: number;
  timeMs: number; // capped time of timed graded reviews
  responseTimesMs: number[]; // raw response times of timed graded reviews
}

/**
 * Groups every graded review between `start` and `end` (inclusive) by local day.
 * Returns only days that contain at least one review or skip, sorted by date.
 */
export function buildDailyReviewBuckets(
  cards: CardLike[] | undefined,
  start: number = 0,
  end: number = Infinity,
  capMs: number = DEFAULT_MAX_RESPONSE_TIME_MS,
): DailyReviewBucket[] {
  if (!cards || cards.length === 0) return [];
  const buckets = new Map<number, DailyReviewBucket>();

  for (const card of cards) {
    const history = card.repetitionHistory;
    if (!history) continue;
    for (const rep of history) {
      if (!isValidReviewDate(rep.date) || rep.date < start || rep.date > end) continue;
      const graded = isGradedReview(rep.score);
      const skipped = rep.score === ReviewScore.SKIP;
      if (!graded && !skipped) continue;

      const day = startOfLocalDay(rep.date);
      let bucket = buckets.get(day);
      if (!bucket) {
        bucket = { date: day, reviews: 0, forgot: 0, remembered: 0, skipped: 0, timeMs: 0, responseTimesMs: [] };
        buckets.set(day, bucket);
      }

      if (skipped) {
        bucket.skipped++;
        continue;
      }
      bucket.reviews++;
      if (isForgot(rep.score)) bucket.forgot++;
      else bucket.remembered++;
      if (rep.responseTime && rep.responseTime > 0) {
        bucket.timeMs += capResponseTime(rep.responseTime, capMs);
        bucket.responseTimesMs.push(rep.responseTime);
      }
    }
  }

  return [...buckets.values()].sort((a, b) => a.date - b.date);
}

/** Number of graded reviews across all cards (skips and schedule edits excluded). */
export function countGradedReviews(cards: CardLike[] | undefined): number {
  if (!cards) return 0;
  let total = 0;
  for (const card of cards) {
    for (const rep of card.repetitionHistory || []) {
      if (isGradedReview(rep.score) && isValidReviewDate(rep.date)) total++;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Forecast
// ---------------------------------------------------------------------------

export interface DueForecastDay {
  date: number; // local midnight
  due: number; // cards scheduled for this day
  overdue: number; // backlog carried into this day (only ever set on day 0)
}

export interface DueForecast {
  days: DueForecastDay[];
  overdueCount: number;
}

/**
 * Forecasts due cards per calendar day, starting today.
 *
 * Cards whose due time has already passed are the backlog: they are reported as
 * `overdueCount` and shown on today's bar. Only cards that have been reviewed at
 * least once count towards the backlog, so brand-new cards don't inflate it.
 */
export function getDueForecast(
  cards: CardLike[] | undefined,
  daysOutlook: number,
  now: number = Date.now(),
): DueForecast {
  const days = Math.max(0, Math.floor(Number(daysOutlook) || 0));
  const dayStarts = eachLocalDay(now, addLocalDays(now, days - 1)).slice(0, days);
  const result: DueForecastDay[] = dayStarts.map(date => ({ date, due: 0, overdue: 0 }));
  if (!cards || result.length === 0) return { days: result, overdueCount: 0 };

  const indexByDay = new Map(result.map((day, index) => [day.date, index]));
  let overdueCount = 0;

  for (const card of cards) {
    const next = card.nextRepetitionTime;
    if (!next || !Number.isFinite(next)) continue;

    if (next <= now) {
      const reviewed = (card.repetitionHistory || []).some(rep => isGradedReview(rep.score));
      if (reviewed) overdueCount++;
      continue;
    }

    const index = indexByDay.get(startOfLocalDay(next));
    if (index !== undefined) result[index].due++;
  }

  if (result.length > 0) result[0].overdue = overdueCount;
  return { days: result, overdueCount };
}

/**
 * Due cards per day as `[timestamp, count]`, including today's backlog.
 * Kept for callers that only need the plain series.
 */
export function getFutureDueCards(
  allCards: CardLike[] | undefined,
  daysOutlook: number,
  now: number = Date.now(),
): [number, number][] {
  return getDueForecast(allCards, daysOutlook, now).days.map(day => [day.date, day.due + day.overdue]);
}

/**
 * Median answer time (capped) of graded reviews in the last `lookbackDays`.
 * Falls back to the full history when there is no recent timed review.
 */
export function getTypicalResponseTime(
  cards: CardLike[] | undefined,
  now: number = Date.now(),
  lookbackDays: number = 30,
  capMs: number = DEFAULT_MAX_RESPONSE_TIME_MS,
): number | undefined {
  if (!cards || cards.length === 0) return undefined;
  const since = addLocalDays(now, -lookbackDays);
  const recent: number[] = [];
  const all: number[] = [];

  for (const card of cards) {
    for (const rep of card.repetitionHistory || []) {
      if (!isGradedReview(rep.score) || !isValidReviewDate(rep.date)) continue;
      if (!rep.responseTime || rep.responseTime <= 0) continue;
      const value = capResponseTime(rep.responseTime, capMs);
      all.push(value);
      if (rep.date >= since && rep.date <= now) recent.push(value);
    }
  }

  const values = recent.length > 0 ? recent : all;
  if (values.length === 0) return undefined;
  values.sort((a, b) => a - b);
  return getInterpolatedQuantile(values, 0.5);
}

// ---------------------------------------------------------------------------
// Score and repetition distributions
// ---------------------------------------------------------------------------

/**
 * Gets number of repetitions grouped by score
 */
export function getNumberRepetitionsGroupedByScore(allCards: CardLike[] | undefined): Record<ScoreName, number> {
  const data: Record<ScoreName, number> = { Skip: 0, Forgot: 0, Hard: 0, Good: 0, Easy: 0 };
  if (!allCards) return data;

  for (const card of allCards) {
    for (const rep of card.repetitionHistory || []) {
      const name = getScoreName(rep.score);
      if (name) data[name]++;
    }
  }
  return data;
}

/**
 * Gets number of cards grouped by how many graded reviews they have.
 */
export function getNumberCardsGroupedByRepetitions(allCards: CardLike[] | undefined): { x: number; y: number }[] {
  if (!allCards) return [];

  const counts = new Map<number, number>();
  for (const card of allCards) {
    const reviews = (card.repetitionHistory || []).filter(rep => isGradedReview(rep.score)).length;
    if (reviews === 0) continue;
    counts.set(reviews, (counts.get(reviews) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([x, y]) => ({ x, y }))
    .sort((a, b) => a.x - b.x);
}

// ---------------------------------------------------------------------------
// Heatmap
// ---------------------------------------------------------------------------

/**
 * Graded reviews per calendar day for the heatmap, including empty days.
 * Open bounds (0 / Infinity) are narrowed to the first / last review.
 */
export function getRepetitionsPerDayOptimized(
  allCards: CardLike[],
  startLimit: number,
  endLimit: number
): { x: number; y: number }[] {
  const buckets = buildDailyReviewBuckets(allCards, startLimit, endLimit).filter(day => day.reviews > 0);
  if (buckets.length === 0) return [];

  const counts = new Map(buckets.map(day => [day.date, day.reviews]));
  const finalStart = startLimit === 0 ? buckets[0].date : startLimit;
  const finalEnd = endLimit === Infinity ? buckets[buckets.length - 1].date : endLimit;

  return eachLocalDay(finalStart, finalEnd).map(day => ({ x: day, y: counts.get(day) || 0 }));
}

/**
 * Get longest streak of days with reviews
 */
export function getLongestStreak(data: { x: number; y: number }[]): number {
  let streak = 0;
  let longest = 0;
  for (const point of data || []) {
    streak = point.y > 0 ? streak + 1 : 0;
    if (streak > longest) longest = streak;
  }
  return longest;
}

/**
 * Get daily average reviews
 */
export function getDailyAverage(data: { x: number; y: number }[]): number {
  if (!data || data.length === 0) return 0;
  const sum = data.reduce((total, point) => total + point.y, 0);
  return Math.round(sum / data.length);
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

export interface DailyRetentionCounts {
  x: number; // local midnight
  remembered: number;
  forgot: number;
}

/** Remembered / forgot counts per study day. */
export function getRetentionCountsPerDay(allCards: CardLike[] | undefined): DailyRetentionCounts[] {
  return buildDailyReviewBuckets(allCards)
    .filter(day => day.reviews > 0)
    .map(day => ({ x: day.date, remembered: day.remembered, forgot: day.forgot }));
}

const toPercent = (remembered: number, total: number) => Math.round((remembered / total) * 1000) / 10;

/**
 * Gets retention rate per study day (percentage of remembered vs forgotten)
 */
export function getRetentionRateOverTime(allCards: CardLike[] | undefined): { x: number; y: number }[] {
  return getRetentionCountsPerDay(allCards).map(day => ({
    x: day.x,
    y: toPercent(day.remembered, day.remembered + day.forgot),
  }));
}

/**
 * Retention over a trailing window of `windowDays` *calendar* days, weighted by
 * review count. Emitted for each study day once the window is fully covered by
 * the data (i.e. at least `windowDays` after the first study day).
 */
export function getWeightedRetentionMovingAverage(
  data: DailyRetentionCounts[],
  windowDays: number
): { x: number; y: number }[] {
  if (!data || data.length === 0 || windowDays <= 0) return [];

  const result: { x: number; y: number }[] = [];
  const firstDay = data[0].x;
  let windowStart = 0;
  let remembered = 0;
  let forgot = 0;

  for (let i = 0; i < data.length; i++) {
    remembered += data[i].remembered;
    forgot += data[i].forgot;
    while (calendarDayDiff(data[windowStart].x, data[i].x) >= windowDays) {
      remembered -= data[windowStart].remembered;
      forgot -= data[windowStart].forgot;
      windowStart++;
    }
    if (calendarDayDiff(firstDay, data[i].x) < windowDays - 1) continue;
    if (remembered + forgot > 0) result.push({ x: data[i].x, y: toPercent(remembered, remembered + forgot) });
  }
  return result;
}

/** Retention of all reviews from the first study day up to each day, weighted by review count. */
export function getWeightedCumulativeRetention(data: DailyRetentionCounts[]): { x: number; y: number }[] {
  let remembered = 0;
  let forgot = 0;
  return (data || []).map(day => {
    remembered += day.remembered;
    forgot += day.forgot;
    return { x: day.x, y: toPercent(remembered, remembered + forgot) };
  });
}

/**
 * Computes a simple moving average series over consecutive points.
 */
export function getMovingAverageSeries(
  data: { x: number; y: number }[],
  windowSize: number
): { x: number; y: number }[] {
  if (!data || data.length === 0 || windowSize <= 1) return data || [];

  const result: { x: number; y: number }[] = [];
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i].y;
    if (i >= windowSize) sum -= data[i - windowSize].y;
    if (i >= windowSize - 1) result.push({ x: data[i].x, y: Math.round((sum / windowSize) * 10) / 10 });
  }
  return result;
}

/**
 * Computes the unweighted cumulative average of (x,y) points.
 */
export function getCumulativeAverageSeries(
  data: { x: number; y: number }[]
): { x: number; y: number }[] {
  let sum = 0;
  return (data || []).map((point, index) => {
    sum += point.y;
    return { x: point.x, y: Math.round((sum / (index + 1)) * 10) / 10 };
  });
}

export interface RetentionBucket {
  remembered: number;
  forgot: number;
  total: number;
  retentionRate?: number; // 0-100, undefined without reviews
}

export interface RetentionByMaturity {
  young: RetentionBucket; // interval 1..20 days
  mature: RetentionBucket; // interval >= 21 days
  learningReviews: number; // first reviews and same-day relearning, excluded above
}

function toRetentionBucket(remembered: number, forgot: number): RetentionBucket {
  const total = remembered + forgot;
  return { remembered, forgot, total, retentionRate: total > 0 ? toPercent(remembered, total) : undefined };
}

/**
 * Splits retention into young and mature cards, like Anki's "true retention".
 *
 * A review's interval is the number of calendar days since the card's previous
 * graded review. The first review of a card and reviews on the same day as the
 * previous one (learning / relearning steps) are counted as learning reviews
 * and left out, because they say little about long-term memory.
 *
 * Pass the cards with their *full* history so intervals that started before the
 * selected period are measured correctly; only reviews between `start` and
 * `end` are counted.
 */
export function getRetentionByMaturity(
  allCards: CardLike[] | undefined,
  start: number = 0,
  end: number = Infinity,
  matureDays: number = MATURE_INTERVAL_DAYS,
): RetentionByMaturity {
  let youngRemembered = 0, youngForgot = 0, matureRemembered = 0, matureForgot = 0, learningReviews = 0;

  for (const card of allCards || []) {
    const reviews = (card.repetitionHistory || [])
      .filter(rep => isGradedReview(rep.score) && isValidReviewDate(rep.date))
      .sort((a, b) => a.date - b.date);

    let previous: number | undefined;
    for (const rep of reviews) {
      const inRange = rep.date >= start && rep.date <= end;
      const interval = previous === undefined ? undefined : calendarDayDiff(previous, rep.date);
      previous = rep.date;
      if (!inRange) continue;

      if (interval === undefined || interval < 1) {
        learningReviews++;
      } else if (interval >= matureDays) {
        if (isRecall(rep.score)) matureRemembered++; else matureForgot++;
      } else {
        if (isRecall(rep.score)) youngRemembered++; else youngForgot++;
      }
    }
  }

  return {
    young: toRetentionBucket(youngRemembered, youngForgot),
    mature: toRetentionBucket(matureRemembered, matureForgot),
    learningReviews,
  };
}

/**
 * Interpolates between two hex colors
 */
export function interpolateColor(color1: string, color2: string, factor: number = 0.5): string {
  if (!/^#[0-9A-F]{6}$/i.test(color1) || !/^#[0-9A-F]{6}$/i.test(color2)) {
    return color1;
  }

  const channel = (color: string, offset: number) => parseInt(color.substring(offset, offset + 2), 16);
  const mix = (offset: number) => Math.round(channel(color1, offset) + factor * (channel(color2, offset) - channel(color1, offset)));
  const r = mix(1);
  const g = mix(3);
  const b = mix(5);

  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// ---------------------------------------------------------------------------
// Hardest cards
// ---------------------------------------------------------------------------

/**
 * Represents a card with difficulty metrics
 */
export interface HardCardData {
  cardId: string;
  remId: string;
  totalReviews: number;
  forgotCount: number;
  rememberedCount: number;
  retentionRate: number; // 0-100 percentage
  /** Upper end of the 95% Wilson interval for the retention rate (0-100). */
  retentionUpperBound: number;
  isLeech: boolean;
  lastReviewDate: number | null;
}

/**
 * Upper bound of the Wilson score interval for `successes` out of `total`.
 * A small sample gets a wide interval, so 0/3 is *less* certainly bad than 5/50.
 */
export function wilsonUpperBound(successes: number, total: number, z: number = 1.96): number {
  if (total <= 0) return 1;
  const p = successes / total;
  const z2 = z * z;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));
  return Math.min(1, (centre + margin) / (1 + z2 / total));
}

/**
 * Gets the hardest cards: those we can be most confident have low retention.
 *
 * Cards are ranked by the upper bound of the 95% Wilson interval of their
 * retention rate (lowest first). This keeps cards with few reviews from crowding
 * out cards that have failed consistently over many reviews.
 *
 * @param allCards - Cards to analyze (usually already filtered to the period)
 * @param limit - Maximum number of cards to return
 * @param minReviews - Minimum graded reviews required to be included
 * @param leechThreshold - Lapses at which a card is flagged as a leech
 */
export function getHardestCards(
  allCards: CardLike[] | undefined,
  limit: number = 10,
  minReviews: number = 3,
  leechThreshold: number = DEFAULT_LEECH_THRESHOLD,
): HardCardData[] {
  if (!allCards || allCards.length === 0) return [];

  const cardStats: HardCardData[] = [];

  for (const card of allCards) {
    const history = card.repetitionHistory;
    if (!history || history.length < minReviews) continue;

    let forgotCount = 0;
    let rememberedCount = 0;
    let markedAsLeech = false;
    let lastReviewDate: number | null = null;

    for (const rep of history) {
      if (!isValidReviewDate(rep.date)) continue;
      if (rep.score === ReviewScore.VIEWED_AS_LEECH) markedAsLeech = true;
      if (!isGradedReview(rep.score)) continue;

      if (lastReviewDate === null || rep.date > lastReviewDate) lastReviewDate = rep.date;
      if (isForgot(rep.score)) forgotCount++;
      else rememberedCount++;
    }

    const totalReviews = forgotCount + rememberedCount;
    if (totalReviews < minReviews) continue;

    cardStats.push({
      cardId: card._id,
      remId: card.remId,
      totalReviews,
      forgotCount,
      rememberedCount,
      retentionRate: toPercent(rememberedCount, totalReviews),
      retentionUpperBound: Math.round(wilsonUpperBound(rememberedCount, totalReviews) * 1000) / 10,
      isLeech: markedAsLeech || forgotCount >= leechThreshold,
      lastReviewDate,
    });
  }

  cardStats.sort((a, b) =>
    a.retentionUpperBound - b.retentionUpperBound
    || a.retentionRate - b.retentionRate
    || b.forgotCount - a.forgotCount
  );

  return cardStats.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Time of day
// ---------------------------------------------------------------------------

/**
 * Represents retention rate data for a time of day block
 */
export interface TimeOfDayRetention {
  timeBlock: string; // e.g., "12 AM - 3 AM"
  startHour: number; // 0-23
  forgotCount: number;
  rememberedCount: number;
  totalReviews: number;
  retentionRate: number; // 0-100 percentage
}

const TIME_BLOCK_LABELS = [
  '12 AM - 3 AM', '3 AM - 6 AM', '6 AM - 9 AM', '9 AM - 12 PM',
  '12 PM - 3 PM', '3 PM - 6 PM', '6 PM - 9 PM', '9 PM - 12 AM',
];

/**
 * Gets retention rate by time of day in 3-hour blocks
 */
export function getRetentionRateByTimeOfDay(allCards: CardLike[] | undefined): TimeOfDayRetention[] {
  if (!allCards || allCards.length === 0) return [];

  const blockStats: TimeOfDayRetention[] = TIME_BLOCK_LABELS.map((label, index) => ({
    timeBlock: label,
    startHour: index * 3,
    forgotCount: 0,
    rememberedCount: 0,
    totalReviews: 0,
    retentionRate: 0,
  }));

  for (const card of allCards) {
    for (const rep of card.repetitionHistory || []) {
      if (!isValidReviewDate(rep.date) || !isGradedReview(rep.score)) continue;
      const block = blockStats[Math.floor(new Date(rep.date).getHours() / 3)];
      if (isForgot(rep.score)) block.forgotCount++;
      else block.rememberedCount++;
    }
  }

  for (const block of blockStats) {
    block.totalReviews = block.forgotCount + block.rememberedCount;
    if (block.totalReviews > 0) block.retentionRate = toPercent(block.rememberedCount, block.totalReviews);
  }

  return blockStats;
}

// ---------------------------------------------------------------------------
// Time spent and recall speed
// ---------------------------------------------------------------------------

/**
 * Represents time statistics for a specific day
 */
export interface DailyTimeStats {
  date: number; // Unix timestamp (local midnight)
  timeMs: number; // Total time in milliseconds, each answer capped
  reviewCount: number; // Number of timed reviews
  responseTimesMs: number[]; // Individual raw response times
}

/**
 * Gets time spent per day from card repetition history.
 * Each answer is capped at `capMs` (0 disables the cap) when adding up time;
 * the raw values are kept in `responseTimesMs` for speed statistics.
 */
export function getTimeSpentPerDay(
  allCards: CardLike[] | undefined,
  startLimit: number = 0,
  endLimit: number = Infinity,
  capMs: number = DEFAULT_MAX_RESPONSE_TIME_MS,
): DailyTimeStats[] {
  return buildDailyReviewBuckets(allCards, startLimit, endLimit, capMs)
    .filter(day => day.responseTimesMs.length > 0)
    .map(day => ({
      date: day.date,
      timeMs: day.timeMs,
      reviewCount: day.responseTimesMs.length,
      responseTimesMs: day.responseTimesMs,
    }));
}

/**
 * Overall time statistics summary
 */
export interface TimeStatsSummary {
  totalTimeMs: number;
  totalReviews: number;
  daysWithReviews: number;
  totalDaysInPeriod: number;
  averageTimePerDay: number; // Average over all days in period (ms)
  averageTimePerReviewDay: number; // Average over days with reviews (ms)
  averageTimePerCard: number; // Average time per card review (ms)
  cardsPerMinute: number; // Average cards per minute
  percentageDaysStudied: number; // Percentage of days studied (0-100)
}

/**
 * Tukey box-plot statistics for response times in a selected period.
 */
export interface ResponseTimeDistribution {
  reviewCount: number;
  averageMs: number;
  q1Ms: number;
  medianMs: number;
  q3Ms: number;
  lowerWhiskerMs: number;
  upperWhiskerMs: number;
  lowOutlierCount: number;
  highOutlierCount: number;
  lowOutliersMs: number[];
  highOutliersMs: number[];
}

function getInterpolatedQuantile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 1) return sortedValues[0];

  const index = (sortedValues.length - 1) * percentile;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  const interpolation = index - lowerIndex;

  return sortedValues[lowerIndex] + (sortedValues[upperIndex] - sortedValues[lowerIndex]) * interpolation;
}

function sampleEvenly(values: number[], maxSamples: number): number[] {
  if (values.length <= maxSamples) return values;

  return Array.from({ length: maxSamples }, (_, index) => {
    const sourceIndex = Math.round(index * (values.length - 1) / (maxSamples - 1));
    return values[sourceIndex];
  });
}

/**
 * Calculates a Tukey box plot from every valid response time in the period.
 */
export function getResponseTimeDistribution(
  dailyData: DailyTimeStats[],
  maxOutlierSamplesPerTail: number = 100
): ResponseTimeDistribution | undefined {
  const responseTimes = dailyData
    .flatMap(day => day.responseTimesMs)
    .filter(responseTime => responseTime > 0)
    .sort((a, b) => a - b);

  if (responseTimes.length === 0) return undefined;

  const averageMs = responseTimes.reduce((total, responseTime) => total + responseTime, 0) / responseTimes.length;
  const q1Ms = getInterpolatedQuantile(responseTimes, 0.25);
  const medianMs = getInterpolatedQuantile(responseTimes, 0.5);
  const q3Ms = getInterpolatedQuantile(responseTimes, 0.75);
  const interquartileRange = q3Ms - q1Ms;
  const lowerFence = q1Ms - 1.5 * interquartileRange;
  const upperFence = q3Ms + 1.5 * interquartileRange;
  const lowOutliers = responseTimes.filter(responseTime => responseTime < lowerFence);
  const highOutliers = responseTimes.filter(responseTime => responseTime > upperFence);
  const nonOutliers = responseTimes.filter(responseTime => responseTime >= lowerFence && responseTime <= upperFence);

  return {
    reviewCount: responseTimes.length,
    averageMs,
    q1Ms,
    medianMs,
    q3Ms,
    lowerWhiskerMs: nonOutliers[0],
    upperWhiskerMs: nonOutliers[nonOutliers.length - 1],
    lowOutlierCount: lowOutliers.length,
    highOutlierCount: highOutliers.length,
    lowOutliersMs: sampleEvenly(lowOutliers, maxOutlierSamplesPerTail),
    highOutliersMs: sampleEvenly(highOutliers, maxOutlierSamplesPerTail)
  };
}

/**
 * Average response time for a study day.
 */
export interface RecallSpeedDataPoint {
  date: number;
  averageResponseTimeMs: number;
  medianResponseTimeMs?: number;
  reviewCount: number; // Reviews retained after percentile trimming
  totalReviewCount: number; // Timed reviews before percentile trimming
}

export type RecallSpeedDirection = 'faster' | 'slower' | 'unchanged';

/**
 * Summary of recent recall speed, optionally compared with the preceding period.
 */
export interface RecallSpeedSummary {
  averageResponseTimeMs: number;
  studyDaysIncluded: number;
  comparison?: {
    averageResponseTimeMs: number;
    differenceMs: number;
    percentageChange: number;
    direction: RecallSpeedDirection;
  };
}

/**
 * Converts daily time statistics into average response time per study day.
 */
export function getRecallSpeedPerDay(dailyData: DailyTimeStats[]): RecallSpeedDataPoint[] {
  return dailyData
    .filter(day => day.responseTimesMs.length > 0)
    .map(day => {
      const sortedResponseTimes = [...day.responseTimesMs].sort((a, b) => a - b);
      const tailCount = sortedResponseTimes.length >= 3
        ? Math.min(
          Math.max(1, Math.floor(sortedResponseTimes.length * 0.05)),
          Math.floor((sortedResponseTimes.length - 1) / 2)
        )
        : 0;
      const retainedResponseTimes = sortedResponseTimes.slice(tailCount, sortedResponseTimes.length - tailCount);
      const totalTimeMs = retainedResponseTimes.reduce((sum, responseTime) => sum + responseTime, 0);
      const middleIndex = Math.floor(retainedResponseTimes.length / 2);
      const medianResponseTimeMs = retainedResponseTimes.length % 2 === 0
        ? (retainedResponseTimes[middleIndex - 1] + retainedResponseTimes[middleIndex]) / 2
        : retainedResponseTimes[middleIndex];

      return {
        date: day.date,
        averageResponseTimeMs: totalTimeMs / retainedResponseTimes.length,
        medianResponseTimeMs,
        reviewCount: retainedResponseTimes.length,
        totalReviewCount: sortedResponseTimes.length
      };
    });
}

/**
 * Computes a weighted moving average of response time across study days.
 */
export function getWeightedRecallSpeedMovingAverage(
  data: RecallSpeedDataPoint[],
  windowSize: number
): RecallSpeedDataPoint[] {
  if (!data || data.length === 0 || windowSize <= 0) return [];

  const result: RecallSpeedDataPoint[] = [];

  for (let index = windowSize - 1; index < data.length; index++) {
    const window = data.slice(index - windowSize + 1, index + 1);
    const reviewCount = window.reduce((sum, day) => sum + day.reviewCount, 0);
    const totalTimeMs = window.reduce(
      (sum, day) => sum + day.averageResponseTimeMs * day.reviewCount,
      0
    );

    result.push({
      date: data[index].date,
      averageResponseTimeMs: totalTimeMs / reviewCount,
      reviewCount,
      totalReviewCount: window.reduce((sum, day) => sum + day.totalReviewCount, 0)
    });
  }

  return result;
}

/**
 * Compares the latest study-day window with the preceding one.
 */
export function calculateRecallSpeedSummary(
  data: RecallSpeedDataPoint[],
  windowSize: number = 7
): RecallSpeedSummary | undefined {
  if (!data || data.length === 0 || windowSize <= 0) return undefined;

  const calculateWeightedAverage = (days: RecallSpeedDataPoint[]) => {
    const reviewCount = days.reduce((sum, day) => sum + day.reviewCount, 0);
    const totalTimeMs = days.reduce(
      (sum, day) => sum + day.averageResponseTimeMs * day.reviewCount,
      0
    );
    return totalTimeMs / reviewCount;
  };

  const currentWindow = data.slice(-windowSize);
  const averageResponseTimeMs = calculateWeightedAverage(currentWindow);
  const summary: RecallSpeedSummary = {
    averageResponseTimeMs,
    studyDaysIncluded: currentWindow.length
  };

  if (data.length < windowSize * 2) return summary;

  const previousWindow = data.slice(-windowSize * 2, -windowSize);
  const previousAverageResponseTimeMs = calculateWeightedAverage(previousWindow);
  const differenceMs = averageResponseTimeMs - previousAverageResponseTimeMs;
  const percentageChange = previousAverageResponseTimeMs > 0
    ? (differenceMs / previousAverageResponseTimeMs) * 100
    : 0;

  summary.comparison = {
    averageResponseTimeMs: previousAverageResponseTimeMs,
    differenceMs,
    percentageChange,
    direction: differenceMs < 0 ? 'faster' : differenceMs > 0 ? 'slower' : 'unchanged'
  };

  return summary;
}

/**
 * Calculates overall time statistics from daily data
 * @param dailyData - Array of daily time statistics
 * @param startDate - Start of the period (for calculating total days)
 * @param endDate - End of the period
 * @returns Summary of time statistics
 */
export function calculateTimeStatsSummary(
  dailyData: DailyTimeStats[],
  startDate?: number,
  endDate?: number
): TimeStatsSummary {
  if (dailyData.length === 0) {
    return {
      totalTimeMs: 0,
      totalReviews: 0,
      daysWithReviews: 0,
      totalDaysInPeriod: 0,
      averageTimePerDay: 0,
      averageTimePerReviewDay: 0,
      averageTimePerCard: 0,
      cardsPerMinute: 0,
      percentageDaysStudied: 0
    };
  }

  const totalTimeMs = dailyData.reduce((sum, day) => sum + day.timeMs, 0);
  const totalReviews = dailyData.reduce((sum, day) => sum + day.reviewCount, 0);
  const daysWithReviews = dailyData.filter(day => day.reviewCount > 0).length;

  // Calculate the full calendar span, including days without reviews. For open
  // date ranges, use the first and last days represented by the available data.
  const firstReviewDay = dailyData.reduce((min, day) => Math.min(min, day.date), Infinity);
  const lastReviewDay = dailyData.reduce((max, day) => Math.max(max, day.date), -Infinity);
  const periodStart = startDate ?? firstReviewDay;
  const periodEnd = endDate ?? addLocalDays(lastReviewDay, 1);
  const totalDaysInPeriod = Math.max(calendarDayDiff(periodStart, periodEnd), dailyData.length);

  const averageTimePerDay = totalDaysInPeriod > 0 ? totalTimeMs / totalDaysInPeriod : 0;
  const averageTimePerReviewDay = daysWithReviews > 0 ? totalTimeMs / daysWithReviews : 0;
  const averageTimePerCard = totalReviews > 0 ? totalTimeMs / totalReviews : 0;
  const cardsPerMinute = totalTimeMs > 0 ? (totalReviews / (totalTimeMs / 60000)) : 0;
  const percentageDaysStudied = totalDaysInPeriod > 0 ? (daysWithReviews / totalDaysInPeriod) * 100 : 0;

  return {
    totalTimeMs,
    totalReviews,
    daysWithReviews,
    totalDaysInPeriod,
    averageTimePerDay,
    averageTimePerReviewDay,
    averageTimePerCard,
    cardsPerMinute,
    percentageDaysStudied
  };
}

/**
 * Format milliseconds to human-readable time string
 * @param ms - Time in milliseconds
 * @param format - 'short' ("1h 23m"), 'long' ("1 hour 23 minutes"), 'hours' ("1.38h"), 'seconds' ("4.20s")
 */
export function formatTime(ms: number, format: 'short' | 'long' | 'hours' | 'seconds' = 'short'): string {
  if (ms === 0) {
    if (format === 'hours') return '0.00h';
    if (format === 'seconds') return '0.00s';
    return '0s';
  }

  if (format === 'hours') return `${(ms / (1000 * 60 * 60)).toFixed(2)}h`;
  if (format === 'seconds') return `${(ms / 1000).toFixed(2)}s`;

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(format === 'long' ? `${hours} hour${hours > 1 ? 's' : ''}` : `${hours}h`);
  }
  if (minutes > 0) {
    parts.push(format === 'long' ? `${minutes} minute${minutes > 1 ? 's' : ''}` : `${minutes}m`);
  }
  if (seconds > 0 && hours === 0) { // Only show seconds if less than an hour
    parts.push(format === 'long' ? `${seconds} second${seconds > 1 ? 's' : ''}` : `${seconds}s`);
  }

  return parts.join(' ') || '0s';
}

