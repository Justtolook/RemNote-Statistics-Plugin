/**
 * Live fatigue tracking while reviewing in the queue.
 *
 * The plugin records each answer of the current study session and compares it
 * with the user's personal fatigue profile (computed from their history, see
 * `buildFatigueProfile`). Kept free of SDK calls so it can be tested.
 */
import { calendarDayDiff } from './calendar';
import { getFatigueCurve, getGradedReviewDates, getSpacedReviews, FATIGUE_BASELINE_MINUTES, SESSION_GAP_MS } from './insights';
import { isGradedReview, isRecall, isValidReviewDate } from './reviewScores';

type ReviewLike = { date: number; score?: number; responseTime?: number };
type CardLike = { repetitionHistory?: ReviewLike[] | null };

/** Used when the history is too short for a personal break point. */
export const DEFAULT_BREAK_AFTER_MINUTES = 30;
/** Live signals need at least this many recent spaced reviews. */
export const MIN_LIVE_REVIEWS = 8;
/** Number of most recent spaced reviews used for the live signals. */
export const RECENT_WINDOW = 15;
/** Live retention drop (points) that counts as a fatigue signal. Larger than in the history analysis, since samples are small. */
export const LIVE_DROP_POINTS = 10;
/** Live slowdown (percent) that counts as a fatigue signal. */
export const LIVE_SLOWDOWN_PERCENT = 25;
/** How much history the profile is built from. */
export const PROFILE_LOOKBACK_DAYS = 90;
/** The profile is rebuilt when it is older than this. */
export const PROFILE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface LiveReview {
  cardId: string;
  date: number;
  recalled: boolean;
  /** Previous review of this card was at least a day earlier. */
  spaced: boolean;
  responseTime?: number;
}

export interface LiveSession {
  reviews: LiveReview[];
}

export interface FatigueProfile {
  computedAt: number;
  /** Personal break point, or undefined when no drop was found / not enough data. */
  breakAfterMinutes?: number;
  /** True when the history showed sessions long enough without a drop. */
  noDropFound: boolean;
  baselineRate?: number; // 0-100, first minutes of sessions
  baselineMedianMs?: number;
}

export type FatigueLevel = 'low' | 'medium' | 'high';

export interface LiveFatigue {
  active: boolean; // a session is in progress
  minutes: number;
  reviews: number;
  breakAfterMinutes: number;
  personalBreakPoint: boolean;
  /** 0-100, how close the session is to needing a break. */
  score: number;
  level: FatigueLevel;
  signals: {
    time: boolean;
    retention?: { recentRate: number; baselineRate: number; dropped: boolean };
    speed?: { recentMedianMs: number; baselineMedianMs: number; slowdownPercent: number; slowed: boolean };
  };
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * Turns the latest entry of a card's history into a live review, or returns
 * undefined when the latest entry is not a graded answer.
 */
export function getLatestLiveReview(cardId: string, card: CardLike | undefined): LiveReview | undefined {
  const reviews = (card?.repetitionHistory || [])
    .filter(rep => isValidReviewDate(rep.date))
    .sort((a, b) => a.date - b.date);
  const latest = reviews[reviews.length - 1];
  if (!latest || !isGradedReview(latest.score)) return undefined;

  const previous = reviews.slice(0, -1).reverse().find(rep => isGradedReview(rep.score));
  return {
    cardId,
    date: latest.date,
    recalled: isRecall(latest.score),
    spaced: previous !== undefined && calendarDayDiff(previous.date, latest.date) >= 1,
    responseTime: latest.responseTime && latest.responseTime > 0 ? latest.responseTime : undefined,
  };
}

/**
 * Adds a review to the session. Starts a new session after a pause longer than
 * `SESSION_GAP_MS`, and ignores a review that is already recorded.
 */
export function appendLiveReview(session: LiveSession | undefined, review: LiveReview): LiveSession {
  const reviews = session?.reviews ?? [];
  if (reviews.some(existing => existing.cardId === review.cardId && existing.date === review.date)) {
    return session ?? { reviews };
  }
  const last = reviews[reviews.length - 1];
  if (last && review.date - last.date > SESSION_GAP_MS) return { reviews: [review] };
  return { reviews: [...reviews, review].sort((a, b) => a.date - b.date) };
}

/** Builds the personal fatigue profile from the last `PROFILE_LOOKBACK_DAYS` of history. */
export function buildFatigueProfile(cards: CardLike[] | undefined, now: number = Date.now()): FatigueProfile {
  const start = now - PROFILE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const curve = getFatigueCurve(getSpacedReviews(cards, start, now), getGradedReviewDates(cards, start, now));
  const baselineBuckets = curve.buckets.filter(bucket => bucket.startMinute < FATIGUE_BASELINE_MINUTES);
  const baselineMedianMs = median(baselineBuckets.map(bucket => bucket.medianResponseMs).filter((v): v is number => v !== undefined));

  return {
    computedAt: now,
    breakAfterMinutes: curve.verdict.kind === 'drop' ? curve.verdict.afterMinute : undefined,
    noDropFound: curve.verdict.kind === 'no-drop',
    baselineRate: curve.verdict.kind === 'not-enough-data' ? undefined : curve.verdict.baselineRate,
    baselineMedianMs,
  };
}

/**
 * Estimates the current fatigue from the session so far.
 *
 * - Time: minutes since the session started, against the personal break point
 *   (or `DEFAULT_BREAK_AFTER_MINUTES`).
 * - Retention: the last spaced reviews against the personal baseline (or the
 *   first minutes of this session).
 * - Speed: the median answer time of the last reviews against the baseline.
 */
export function assessLiveFatigue(session: LiveSession | undefined, now: number, profile?: FatigueProfile): LiveFatigue {
  const reviews = session?.reviews ?? [];
  const personalBreakPoint = profile?.breakAfterMinutes !== undefined;
  // With a long history and no drop, wait longer before suggesting a break.
  const breakAfterMinutes = profile?.breakAfterMinutes
    ?? (profile?.noDropFound ? DEFAULT_BREAK_AFTER_MINUTES * 2 : DEFAULT_BREAK_AFTER_MINUTES);
  const last = reviews[reviews.length - 1];
  const active = last !== undefined && now - last.date <= SESSION_GAP_MS;

  if (!active) {
    return { active: false, minutes: 0, reviews: 0, breakAfterMinutes, personalBreakPoint, score: 0, level: 'low', signals: { time: false } };
  }

  const first = reviews[0];
  const minutes = Math.max(0, (now - first.date) / 60000);
  const timeSignal = minutes >= breakAfterMinutes;

  const spaced = reviews.filter(review => review.spaced);
  const recent = spaced.slice(-RECENT_WINDOW);
  const signals: LiveFatigue['signals'] = { time: timeSignal };

  // Retention: personal baseline, or the first minutes of this session.
  const sessionBaseline = spaced.filter(review => review.date - first.date < FATIGUE_BASELINE_MINUTES * 60000);
  const baselineRate = profile?.baselineRate
    ?? (sessionBaseline.length >= MIN_LIVE_REVIEWS ? (sessionBaseline.filter(r => r.recalled).length / sessionBaseline.length) * 100 : undefined);
  if (recent.length >= MIN_LIVE_REVIEWS && baselineRate !== undefined) {
    const recentRate = (recent.filter(review => review.recalled).length / recent.length) * 100;
    signals.retention = {
      recentRate: Math.round(recentRate * 10) / 10,
      baselineRate: Math.round(baselineRate * 10) / 10,
      dropped: recentRate <= baselineRate - LIVE_DROP_POINTS,
    };
  }

  // Speed: all recent answers (spaced or not) are fine for timing.
  const recentTimes = reviews.slice(-RECENT_WINDOW).map(review => review.responseTime).filter((v): v is number => v !== undefined);
  const baselineMedianMs = profile?.baselineMedianMs;
  const recentMedianMs = median(recentTimes);
  if (recentTimes.length >= MIN_LIVE_REVIEWS && baselineMedianMs && recentMedianMs !== undefined) {
    const slowdownPercent = Math.round(((recentMedianMs - baselineMedianMs) / baselineMedianMs) * 100);
    signals.speed = { recentMedianMs, baselineMedianMs, slowdownPercent, slowed: slowdownPercent >= LIVE_SLOWDOWN_PERCENT };
  }

  const dropped = signals.retention?.dropped ?? false;
  const slowed = signals.speed?.slowed ?? false;
  let level: FatigueLevel = 'low';
  if ((timeSignal && (dropped || slowed)) || minutes >= breakAfterMinutes * 1.5 || (dropped && slowed)) level = 'high';
  else if (timeSignal || dropped || slowed) level = 'medium';

  const score = Math.min(100, Math.round((minutes / breakAfterMinutes) * 70 + (dropped ? 15 : 0) + (slowed ? 15 : 0)));

  return { active: true, minutes, reviews: reviews.length, breakAfterMinutes, personalBreakPoint, score, level, signals };
}
