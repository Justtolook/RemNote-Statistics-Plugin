import { Card } from '@remnote/plugin-sdk';
import React from 'react';
import { transformObjectToCategoryFormat } from '../../lib/chartHelpers';
import { eachLocalDay } from '../../lib/calendar';
import { AnalysisRange, filterCardsByRange } from '../../lib/dateRange';
import {
  buildDailyReviewBuckets,
  calculateRecallSpeedSummary,
  calculateTimeStatsSummary,
  getAnalysisTimestamps,
  getDailyAverage,
  getDueForecast,
  getHardestCards,
  getLongestStreak,
  getNumberCardsGroupedByRepetitions,
  getNumberRepetitionsGroupedByScore,
  getRecallSpeedPerDay,
  getResponseTimeDistribution,
  getRetentionByMaturity,
  getRetentionRateByTimeOfDay,
  getTimeSpentPerDay,
  getTypicalResponseTime,
  getWeightedCumulativeRetention,
  getWeightedRecallSpeedMovingAverage,
  getWeightedRetentionMovingAverage,
  DailyRetentionCounts,
} from '../../lib/dataProcessing';

export interface StatisticsDataOptions {
  cards: Card[] | undefined;
  range: AnalysisRange | undefined;
  maxAnswerMs: number;
  leechThreshold: number;
  dueOutlookDays: number;
  hardestCardsLimit: number;
}

/**
 * Derives every dataset the dashboard shows from the active cards and period.
 * Each value is memoised on the inputs it depends on, so changing e.g. the
 * forecast length does not recompute the review history charts.
 */
export function useStatisticsData({
  cards,
  range,
  maxAnswerMs,
  leechThreshold,
  dueOutlookDays,
  hardestCardsLimit,
}: StatisticsDataOptions) {
  const { start, end } = React.useMemo(() => getAnalysisTimestamps(range), [range]);

  // Cards with their history narrowed to the selected period.
  const filteredCards = React.useMemo(
    () => (cards ? filterCardsByRange(cards, range) as Card[] : []),
    [cards, range],
  );

  // One pass over the period's reviews, shared by the heatmap, retention and totals.
  const dailyBuckets = React.useMemo(
    () => buildDailyReviewBuckets(cards, start, end, maxAnswerMs),
    [cards, start, end, maxAnswerMs],
  );

  const totals = React.useMemo(() => {
    let reviews = 0, forgot = 0, remembered = 0;
    for (const day of dailyBuckets) {
      reviews += day.reviews;
      forgot += day.forgot;
      remembered += day.remembered;
    }
    return { reviews, forgot, remembered, retention: reviews > 0 ? remembered / reviews : undefined };
  }, [dailyBuckets]);

  const heatmap = React.useMemo(() => {
    const studyDays = dailyBuckets.filter(day => day.reviews > 0);
    const counts = new Map(studyDays.map(day => [day.date, day.reviews]));
    const data = studyDays.length === 0 ? [] : eachLocalDay(
      start === 0 ? studyDays[0].date : start,
      end === Infinity ? studyDays[studyDays.length - 1].date : end,
    ).map(day => ({ x: day, y: counts.get(day) || 0 }));
    return {
      data,
      daysLearned: data.filter(d => d.y > 0).length,
      dailyAverage: getDailyAverage(data),
      longestStreak: getLongestStreak(data),
    };
  }, [dailyBuckets, start, end]);

  const buttons = React.useMemo(() => {
    const counts = getNumberRepetitionsGroupedByScore(filteredCards);
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    return { counts, total, chartData: transformObjectToCategoryFormat(counts) };
  }, [filteredCards]);

  const cardsByReviews = React.useMemo(() => getNumberCardsGroupedByRepetitions(filteredCards), [filteredCards]);

  const cumulativeReviews = React.useMemo(() => {
    let running = 0;
    return dailyBuckets
      .filter(day => day.reviews > 0)
      .map(day => [day.date, (running += day.reviews)] as [number, number]);
  }, [dailyBuckets]);

  const retention = React.useMemo(() => {
    const counts: DailyRetentionCounts[] = dailyBuckets
      .filter(day => day.reviews > 0)
      .map(day => ({ x: day.date, remembered: day.remembered, forgot: day.forgot }));
    return {
      daily: counts.map(day => ({ x: day.x, y: Math.round((day.remembered / (day.remembered + day.forgot)) * 1000) / 10 })),
      weekly: getWeightedRetentionMovingAverage(counts, 7),
      monthly: getWeightedRetentionMovingAverage(counts, 30),
      cumulative: getWeightedCumulativeRetention(counts),
    };
  }, [dailyBuckets]);

  // Needs full histories to measure intervals that began before the period.
  const maturity = React.useMemo(() => getRetentionByMaturity(cards, start, end), [cards, start, end]);

  const timeOfDay = React.useMemo(() => getRetentionRateByTimeOfDay(filteredCards), [filteredCards]);

  const hardestCards = React.useMemo(
    () => getHardestCards(filteredCards, hardestCardsLimit, 3, leechThreshold),
    [filteredCards, hardestCardsLimit, leechThreshold],
  );

  const time = React.useMemo(() => {
    const daily = getTimeSpentPerDay(cards, start, end, maxAnswerMs);
    // calculateTimeStatsSummary expects an exclusive end.
    const summary = range
      ? calculateTimeStatsSummary(daily, start, end + 1)
      : calculateTimeStatsSummary(daily);
    const recallSpeed = getRecallSpeedPerDay(daily);
    return {
      daily,
      summary,
      recallSpeed,
      recallSpeedMovingAverage: getWeightedRecallSpeedMovingAverage(recallSpeed, 7),
      recallSpeedSummary: calculateRecallSpeedSummary(recallSpeed, 7),
      distribution: getResponseTimeDistribution(daily),
    };
  }, [cards, start, end, range, maxAnswerMs]);

  const forecast = React.useMemo(() => getDueForecast(cards, dueOutlookDays), [cards, dueOutlookDays]);
  const typicalResponseMs = React.useMemo(() => getTypicalResponseTime(cards, Date.now(), 30, maxAnswerMs), [cards, maxAnswerMs]);

  return {
    start,
    end,
    filteredCards,
    totals,
    heatmap,
    buttons,
    cardsByReviews,
    cumulativeReviews,
    retention,
    maturity,
    timeOfDay,
    hardestCards,
    time,
    forecast,
    typicalResponseMs,
  };
}

export type StatisticsData = ReturnType<typeof useStatisticsData>;
