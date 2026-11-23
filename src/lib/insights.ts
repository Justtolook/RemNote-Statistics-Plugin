/**
 * Learning insights: the personal forgetting curve and the in-session fatigue curve.
 *
 * Both only use "spaced" reviews: graded reviews whose previous graded review
 * of the same card was at least one calendar day earlier. First reviews and
 * same-day relearning steps are left out, because they behave very differently
 * and would distort both curves.
 */
import { calendarDayDiff } from './calendar';
import { wilsonLowerBound, wilsonUpperBound } from './dataProcessing';
import { isGradedReview, isRecall, isValidReviewDate } from './reviewScores';

type ReviewLike = { date: number; score?: number; responseTime?: number };
type CardLike = { repetitionHistory?: ReviewLike[] | null };

/** Buckets with fewer reviews are shown, but not used for conclusions. */
export const MIN_REVIEWS_FOR_INSIGHT = 20;

export interface SpacedReview {
  date: number;
  recalled: boolean;
  intervalDays: number;
  responseTime?: number;
}

/**
 * All spaced reviews between `start` and `end`, with the interval since the
 * card's previous graded review. Pass cards with their full history so that
 * intervals starting before the period are measured correctly.
 */
export function getSpacedReviews(cards: CardLike[] | undefined, start: number = 0, end: number = Infinity): SpacedReview[] {
  const result: SpacedReview[] = [];
  for (const card of cards || []) {
    const reviews = (card.repetitionHistory || [])
      .filter(rep => isGradedReview(rep.score) && isValidReviewDate(rep.date))
      .sort((a, b) => a.date - b.date);

    for (let i = 1; i < reviews.length; i++) {
      const rep = reviews[i];
      if (rep.date < start || rep.date > end) continue;
      const intervalDays = calendarDayDiff(reviews[i - 1].date, rep.date);
      if (intervalDays < 1) continue;
      result.push({
        date: rep.date,
        recalled: isRecall(rep.score),
        intervalDays,
        responseTime: rep.responseTime && rep.responseTime > 0 ? rep.responseTime : undefined,
      });
    }
  }
  return result;
}

interface RateStats {
  remembered: number;
  forgot: number;
  total: number;
  retentionRate?: number; // 0-100
  lowerBound?: number; // 0-100, 95% Wilson interval
  upperBound?: number; // 0-100
  reliable: boolean; // total >= MIN_REVIEWS_FOR_INSIGHT
}

function toRateStats(remembered: number, forgot: number, minReviews: number): RateStats {
  const total = remembered + forgot;
  const round = (value: number) => Math.round(value * 1000) / 10;
  return {
    remembered,
    forgot,
    total,
    retentionRate: total > 0 ? round(remembered / total) : undefined,
    lowerBound: total > 0 ? round(wilsonLowerBound(remembered, total)) : undefined,
    upperBound: total > 0 ? round(wilsonUpperBound(remembered, total)) : undefined,
    reliable: total >= minReviews,
  };
}

// ---------------------------------------------------------------------------
// Forgetting curve
// ---------------------------------------------------------------------------

/** Lower edges (in days) of the interval buckets; roughly doubling. */
export const INTERVAL_BUCKET_EDGES = [1, 2, 4, 8, 15, 31, 61, 121, 241];

export interface ForgettingCurveBucket extends RateStats {
  label: string;
  minDays: number;
  maxDays?: number; // inclusive; undefined for the last bucket
}

export type ForgettingCurveVerdict =
  | { kind: 'not-enough-data' }
  /** A bucket is clearly below target: its whole 95% interval lies under it. */
  | { kind: 'below-target'; lastOnTarget?: ForgettingCurveBucket; firstBelow: ForgettingCurveBucket }
  /** No bucket is clearly below target. `allAbove`: every reliable bucket reaches it. */
  | { kind: 'on-target'; longestReliable: ForgettingCurveBucket; allAbove: boolean };

export interface ForgettingCurve {
  buckets: ForgettingCurveBucket[];
  verdict: ForgettingCurveVerdict;
}

function bucketLabel(minDays: number, maxDays?: number): string {
  if (maxDays === undefined) return `${minDays}+ days`;
  if (minDays === maxDays) return minDays === 1 ? '1 day' : `${minDays} days`;
  return `${minDays}–${maxDays} days`;
}

/**
 * Recall rate by the interval since the previous review: your own forgetting
 * curve. Compares each bucket with the target retention (0-100).
 */
export function getForgettingCurve(
  reviews: SpacedReview[],
  targetRetention: number,
  minReviews: number = MIN_REVIEWS_FOR_INSIGHT,
): ForgettingCurve {
  const counts = INTERVAL_BUCKET_EDGES.map(() => ({ remembered: 0, forgot: 0 }));
  for (const review of reviews) {
    let index = INTERVAL_BUCKET_EDGES.length - 1;
    while (index > 0 && review.intervalDays < INTERVAL_BUCKET_EDGES[index]) index--;
    if (review.recalled) counts[index].remembered++;
    else counts[index].forgot++;
  }

  const buckets: ForgettingCurveBucket[] = INTERVAL_BUCKET_EDGES.map((minDays, index) => {
    const next = INTERVAL_BUCKET_EDGES[index + 1];
    const maxDays = next === undefined ? undefined : next - 1;
    return {
      label: bucketLabel(minDays, maxDays),
      minDays,
      maxDays,
      ...toRateStats(counts[index].remembered, counts[index].forgot, minReviews),
    };
  });

  // Trim empty buckets at the long end so the chart does not end in a gap.
  let last = buckets.length - 1;
  while (last >= 0 && buckets[last].total === 0) last--;
  const visible = buckets.slice(0, last + 1);

  const reliable = visible.filter(bucket => bucket.reliable);
  let verdict: ForgettingCurveVerdict;
  if (reliable.length === 0) {
    verdict = { kind: 'not-enough-data' };
  } else {
    // Small dips that could be chance do not count; the whole 95% interval must be below.
    const firstBelowIndex = reliable.findIndex(bucket => (bucket.upperBound ?? 100) < targetRetention);
    if (firstBelowIndex === -1) {
      verdict = {
        kind: 'on-target',
        longestReliable: reliable[reliable.length - 1],
        allAbove: reliable.every(bucket => (bucket.retentionRate ?? 0) >= targetRetention),
      };
    } else {
      verdict = {
        kind: 'below-target',
        lastOnTarget: firstBelowIndex > 0 ? reliable[firstBelowIndex - 1] : undefined,
        firstBelow: reliable[firstBelowIndex],
      };
    }
  }

  return { buckets: visible, verdict };
}

// ---------------------------------------------------------------------------
// Fatigue curve
// ---------------------------------------------------------------------------

/** A pause longer than this starts a new study session. */
export const SESSION_GAP_MS = 10 * 60 * 1000;
/** Width of the "minutes into the session" buckets. */
export const FATIGUE_BUCKET_MINUTES = 5;
/** Everything from this many minutes on is pooled into the last bucket. */
export const FATIGUE_MAX_MINUTES = 60;
/** Minutes at the start of a session used as the baseline. */
export const FATIGUE_BASELINE_MINUTES = 10;
/** Drop in retention (percentage points) that counts as fatigue. */
export const FATIGUE_DROP_POINTS = 5;

export interface FatigueBucket extends RateStats {
  label: string;
  startMinute: number;
  medianResponseMs?: number;
}

export interface SessionSummary {
  sessions: number;
  medianDurationMinutes: number;
  medianReviews: number;
}

export type FatigueVerdict =
  | { kind: 'not-enough-data' }
  | { kind: 'no-drop'; testedUpToMinute: number; baselineRate: number }
  | {
    kind: 'drop';
    afterMinute: number;
    baselineRate: number;
    droppedRate: number;
    slowdownPercent?: number;
    sessionsLongerShare: number; // 0-100, sessions that run past `afterMinute`
  };

export interface FatigueCurve {
  buckets: FatigueBucket[];
  sessions: SessionSummary;
  verdict: FatigueVerdict;
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * Groups reviews into sessions (pauses over `SESSION_GAP_MS` split them) and
 * measures recall rate and answer speed by minutes into the session.
 *
 * `allReviewDates` should contain every graded review (spaced or not) in the
 * period, so that learning steps keep a session going; only `spacedReviews`
 * are scored.
 */
export function getFatigueCurve(
  spacedReviews: SpacedReview[],
  allReviewDates: number[],
  minReviews: number = MIN_REVIEWS_FOR_INSIGHT,
): FatigueCurve {
  const empty: FatigueCurve = {
    buckets: [],
    sessions: { sessions: 0, medianDurationMinutes: 0, medianReviews: 0 },
    verdict: { kind: 'not-enough-data' },
  };
  if (allReviewDates.length === 0) return empty;

  // Sessions from every review timestamp.
  const dates = [...allReviewDates].sort((a, b) => a - b);
  const sessionStarts: number[] = [];
  const sessionEnds: number[] = [];
  const sessionSizes: number[] = [];
  for (let i = 0; i < dates.length; i++) {
    if (i === 0 || dates[i] - dates[i - 1] > SESSION_GAP_MS) {
      sessionStarts.push(dates[i]);
      sessionEnds.push(dates[i]);
      sessionSizes.push(0);
    }
    sessionEnds[sessionEnds.length - 1] = dates[i];
    sessionSizes[sessionSizes.length - 1]++;
  }
  const durations = sessionStarts.map((startTime, index) => (sessionEnds[index] - startTime) / 60000);

  // Position of each spaced review within its session.
  const bucketCount = FATIGUE_MAX_MINUTES / FATIGUE_BUCKET_MINUTES + 1;
  const counts = Array.from({ length: bucketCount }, () => ({ remembered: 0, forgot: 0, times: [] as number[] }));
  const sortedSpaced = [...spacedReviews].sort((a, b) => a.date - b.date);
  let session = 0;
  for (const review of sortedSpaced) {
    while (session + 1 < sessionStarts.length && sessionStarts[session + 1] <= review.date) session++;
    const minutes = (review.date - sessionStarts[session]) / 60000;
    if (minutes < 0) continue; // Review not covered by allReviewDates.
    const index = Math.min(bucketCount - 1, Math.floor(minutes / FATIGUE_BUCKET_MINUTES));
    if (review.recalled) counts[index].remembered++;
    else counts[index].forgot++;
    if (review.responseTime !== undefined) counts[index].times.push(review.responseTime);
  }

  let buckets: FatigueBucket[] = counts.map((count, index) => {
    const startMinute = index * FATIGUE_BUCKET_MINUTES;
    return {
      label: index === bucketCount - 1 ? `${startMinute}+ min` : `${startMinute}–${startMinute + FATIGUE_BUCKET_MINUTES} min`,
      startMinute,
      medianResponseMs: median(count.times),
      ...toRateStats(count.remembered, count.forgot, minReviews),
    };
  });
  let last = buckets.length - 1;
  while (last >= 0 && buckets[last].total === 0) last--;
  buckets = buckets.slice(0, last + 1);

  const sessions: SessionSummary = {
    sessions: sessionStarts.length,
    medianDurationMinutes: Math.round((median(durations) ?? 0) * 10) / 10,
    medianReviews: median(sessionSizes) ?? 0,
  };

  // Baseline: the first minutes of every session.
  const baselineBuckets = buckets.filter(bucket => bucket.startMinute < FATIGUE_BASELINE_MINUTES);
  const baselineRemembered = baselineBuckets.reduce((sum, bucket) => sum + bucket.remembered, 0);
  const baselineTotal = baselineBuckets.reduce((sum, bucket) => sum + bucket.total, 0);
  const later = buckets.filter(bucket => bucket.startMinute >= FATIGUE_BASELINE_MINUTES && bucket.reliable);
  if (baselineTotal < minReviews || later.length === 0) return { buckets, sessions, verdict: { kind: 'not-enough-data' } };

  const baselineRate = Math.round((baselineRemembered / baselineTotal) * 1000) / 10;
  const baselineTimes = baselineBuckets.map(bucket => bucket.medianResponseMs).filter((value): value is number => value !== undefined);
  const baselineMedianMs = median(baselineTimes);

  // A drop must be large enough to matter and unlikely to be noise: the bucket's
  // whole 95% interval has to lie below the baseline.
  const dropBucket = later.find(bucket =>
    (bucket.retentionRate ?? 100) <= baselineRate - FATIGUE_DROP_POINTS
    && (bucket.upperBound ?? 100) < baselineRate
  );
  if (!dropBucket) {
    const testedUpTo = later[later.length - 1].startMinute + FATIGUE_BUCKET_MINUTES;
    return { buckets, sessions, verdict: { kind: 'no-drop', testedUpToMinute: testedUpTo, baselineRate } };
  }

  const slowdownPercent = baselineMedianMs && dropBucket.medianResponseMs
    ? Math.round(((dropBucket.medianResponseMs - baselineMedianMs) / baselineMedianMs) * 100)
    : undefined;
  const longer = durations.filter(duration => duration > dropBucket.startMinute).length;

  return {
    buckets,
    sessions,
    verdict: {
      kind: 'drop',
      afterMinute: dropBucket.startMinute,
      baselineRate,
      droppedRate: dropBucket.retentionRate ?? 0,
      slowdownPercent,
      sessionsLongerShare: Math.round((longer / sessionStarts.length) * 1000) / 10,
    },
  };
}

/** Timestamps of all graded reviews between `start` and `end`. */
export function getGradedReviewDates(cards: CardLike[] | undefined, start: number = 0, end: number = Infinity): number[] {
  const dates: number[] = [];
  for (const card of cards || []) {
    for (const rep of card.repetitionHistory || []) {
      if (isGradedReview(rep.score) && isValidReviewDate(rep.date) && rep.date >= start && rep.date <= end) dates.push(rep.date);
    }
  }
  return dates;
}
