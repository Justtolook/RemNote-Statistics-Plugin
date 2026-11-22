/**
 * Review scores as stored in RemNote's repetition history.
 *
 * Mirrors the SDK's `QueueInteractionScore` enum. It is duplicated here as plain
 * constants so the pure data-processing code (and its Node test runner) does
 * not have to load the browser-only SDK runtime.
 */
export const ReviewScore = {
  SKIP: 0.01, // "Too early" / skipped
  FORGOT: 0,
  HARD: 0.5,
  GOOD: 1,
  EASY: 1.5,
  VIEWED_AS_LEECH: 2,
  RESET: 3,
  MANUAL_DATE: 4,
  MANUAL_EASE: 5,
} as const;

export type ScoreName = 'Skip' | 'Forgot' | 'Hard' | 'Good' | 'Easy';

/**
 * Reviews from before this date are ignored (1 Jan 2017, CET). Very old
 * histories contain placeholder timestamps that would distort the charts.
 */
export const HISTORY_START_LIMIT = 1483225200000;

/** The answer counted as a successful recall (Hard, Good or Easy). */
export function isRecall(score: number | undefined): boolean {
  return score === ReviewScore.HARD || score === ReviewScore.GOOD || score === ReviewScore.EASY;
}

export function isForgot(score: number | undefined): boolean {
  return score === ReviewScore.FORGOT;
}

/**
 * A graded review is a real answer: Forgot, Hard, Good or Easy.
 * Skips, leech prompts, resets and manual schedule edits are not reviews.
 */
export function isGradedReview(score: number | undefined): boolean {
  return isForgot(score) || isRecall(score);
}

export function getScoreName(score: number | undefined): ScoreName | undefined {
  switch (score) {
    case ReviewScore.SKIP: return 'Skip';
    case ReviewScore.FORGOT: return 'Forgot';
    case ReviewScore.HARD: return 'Hard';
    case ReviewScore.GOOD: return 'Good';
    case ReviewScore.EASY: return 'Easy';
    default: return undefined;
  }
}

/** Whether a repetition timestamp is usable for statistics. */
export function isValidReviewDate(date: number | undefined): date is number {
  return typeof date === 'number' && Number.isFinite(date) && date > HISTORY_START_LIMIT;
}
