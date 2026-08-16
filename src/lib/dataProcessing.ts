import { Card } from '@remnote/plugin-sdk';

const LIMIT = 1483225200000; // 1.1.2017 (unix timestamp)

/**
 * Gets future due cards grouped by day
 */
export function getFutureDueCards(allCards: Card[] | undefined, daysOutlook: number): [number, number][] {
  if (!allCards) return [];
  
  const futureDueCards = allCards.filter((card) => card.nextRepetitionTime && card.nextRepetitionTime > Date.now());
  const futureDueDates = futureDueCards.map((card) => new Date(card.nextRepetitionTime!));
  
  const futureDueDatesGroupedByDay = futureDueDates.reduce((r, a) => {
    r[a.toDateString()] = ++r[a.toDateString()] || 1;
    return r;
  }, Object.create(Object));
  
  const data = Object.keys(futureDueDatesGroupedByDay || {}).map((key) => {
    return [Date.parse(key), futureDueDatesGroupedByDay[key]] as [number, number];
  });
  
  data.sort((a, b) => a[0] - b[0]);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayUnix = Number(today.getTime());
  const days = Number(daysOutlook);
  const futureDueDatesGroupedByDayUnix = Array.from({ length: days }, (v, i) => 
    [todayUnix + i * 24 * 60 * 60 * 1000, 0] as [number, number]
  );
  
  for (let i = 0; i < data.length; i++) {
    for (let j = 0; j < futureDueDatesGroupedByDayUnix.length; j++) {
      if (new Date(data[i][0]).toDateString() === new Date(futureDueDatesGroupedByDayUnix[j][0]).toDateString()) {
        futureDueDatesGroupedByDayUnix[j][1] = data[i][1];
      }
    }
  }
  
  return futureDueDatesGroupedByDayUnix;
}

/**
 * Gets number of repetitions grouped by score
 */
export function getNumberRepetitionsGroupedByScore(allCards: Card[] | undefined) {
  const data = { "Skip": 0, "Forgot": 0, "Hard": 0, "Good": 0, "Easy": 0 };
  if (!allCards) return data;
  
  for (let i = 0; i < allCards.length; i++) {
    const history = allCards[i].repetitionHistory;
    if (!history) continue;
    
    for (let j = 0; j < history.length; j++) {
      let score = history[j].score;
      switch (score) {
        case 0.01: data["Skip"]++; break;
        case 0: data["Forgot"]++; break;
        case 0.5: data["Hard"]++; break;
        case 1: data["Good"]++; break;
        case 1.5: data["Easy"]++; break;
      }
    }
  }
  return data;
}

/**
 * Gets number of cards grouped by repetition count
 */
export function getNumberCardsGroupedByRepetitions(allCards: Card[] | undefined) {
  if (!allCards) return [];
  
  const allCardsWithRepetitionHistory = allCards.filter((card) => card.repetitionHistory && card.repetitionHistory.length > 0);
  const repetitionsPerCard = allCardsWithRepetitionHistory.map(
    (card) => card.repetitionHistory!.length
  );
  
  const repetitionsGroupedByNumber = repetitionsPerCard.reduce((r, a) => {
    r[a] = ++r[a] || 1;
    return r;
  }, Object.create(Object));
  
  const data = Object.keys(repetitionsGroupedByNumber || {}).map((key) => {
    return { x: Number(key), y: repetitionsGroupedByNumber[key] };
  });
  
  return data;
}

/**
 * Gets repetitions per day as object
 */
export function getRepetitionsPerDayObject(allCards: Card[] | undefined) {
  if (!allCards) return [];
  
  const repetitionHistory = allCards.map((card) => card.repetitionHistory);
  const repetitionHistoryDates = repetitionHistory
    .filter(rep => rep !== undefined)
    .flatMap((repetition) => repetition!.map((rep) => rep.date))
    .filter(date => date !== undefined) as number[];
  
  const sortedDates = repetitionHistoryDates.sort((a, b) => a - b);
  const dates = sortedDates.map((date) => new Date(date)).filter((date) => !isNaN(date.getTime()));
  
  const repetitionHistoryDatesFlatSortedDatesGroupedByDay = dates.reduce((r, a) => {
    r[a.toDateString()] = ++r[a.toDateString()] || 1;
    return r;
  }, Object.create(Object));
  
  const repetitionHistoryDatesFlatSortedDatesGroupedByDayUnix = Object.keys(
    repetitionHistoryDatesFlatSortedDatesGroupedByDay || {}
  ).map((key) => {
    return {
      date: new Date(key).getTime(),
      repetitions: repetitionHistoryDatesFlatSortedDatesGroupedByDay[key]
    };
  });
  
  return repetitionHistoryDatesFlatSortedDatesGroupedByDayUnix;
}

/**
 * Gets repetitions per day optimized for heatmap
 */
export function getRepetitionsPerDayOptimized(
  allCards: Card[], 
  startLimit: number, 
  endLimit: number
): { x: number; y: number }[] {
  console.log(`Processing ${allCards.length} cards...`);
  const dailyCounts = new Map<string, number>();
  let minTs = Infinity;
  let maxTs = -Infinity;

  for (let i = 0; i < allCards.length; i++) {
    const history = allCards[i].repetitionHistory;
    if (!history) continue;
    
    for (let j = 0; j < history.length; j++) {
      const ts = history[j].date;
      if (ts < startLimit || ts > endLimit) continue;
      if (ts <= LIMIT) continue;

      if (ts < minTs) minTs = ts;
      if (ts > maxTs) maxTs = ts;

      const dayKey = new Date(ts).toDateString();
      const current = dailyCounts.get(dayKey) || 0;
      dailyCounts.set(dayKey, current + 1);
    }
  }

  if (dailyCounts.size === 0) return [];

  const finalStart = (startLimit === 0) ? minTs : startLimit;
  const finalEnd = (endLimit === Infinity) ? maxTs : endLimit;

  const result: { x: number; y: number }[] = [];
  const current = new Date(finalStart);
  const end = new Date(finalEnd);
  current.setHours(0, 0, 0, 0);
  
  while (current <= end) {
    const key = current.toDateString();
    result.push({
      x: current.getTime(),
      y: dailyCounts.get(key) || 0
    });
    current.setDate(current.getDate() + 1);
  }

  return result;
}

/**
 * Categorize data by weekday for heatmap
 */
export function categorizeDataByWeekday(data: { x: number; y: number }[]) {
  const WeekdaySeries = {
    "Monday": [] as any[], 
    "Tuesday": [] as any[], 
    "Wednesday": [] as any[], 
    "Thursday": [] as any[], 
    "Friday": [] as any[], 
    "Saturday": [] as any[], 
    "Sunday": [] as any[]
  };

  for (let i = 0; i < data.length; i++) {
    const dataPoint = data[i];
    const weekday = new Date(dataPoint.x).getDay();

    switch (weekday) {
      case 0: WeekdaySeries.Sunday.push(dataPoint); break;
      case 1: WeekdaySeries.Monday.push(dataPoint); break;
      case 2: WeekdaySeries.Tuesday.push(dataPoint); break;
      case 3: WeekdaySeries.Wednesday.push(dataPoint); break;
      case 4: WeekdaySeries.Thursday.push(dataPoint); break;
      case 5: WeekdaySeries.Friday.push(dataPoint); break;
      case 6: WeekdaySeries.Saturday.push(dataPoint); break;
    }
  }
  
  return WeekdaySeries;
}

/**
 * Get longest streak of days with reviews
 */
export function getLongestStreak(data: { x: number; y: number }[]): number {
  if (!data || data.length === 0) return 0;
  
  let streak = 0;
  let longestStreak = 0;
  
  for (let i = 0; i < data.length; i++) {
    if (data[i].y > 0) {
      streak++;
    } else {
      if (streak > longestStreak) {
        longestStreak = streak;
      }
      streak = 0;
    }
  }
  
  if (streak > longestStreak) longestStreak = streak;
  return longestStreak;
}

/**
 * Get daily average reviews
 */
export function getDailyAverage(data: { x: number; y: number }[]): number {
  if (!data || data.length === 0) return 0;
  
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i].y;
  }
  
  return Math.round(sum / data.length);
}

/**
 * Gets retention rate over time (percentage of remembered vs forgotten)
 */
export function getRetentionRateOverTime(allCards: Card[] | undefined): { x: number; y: number }[] {
  if (!allCards) return [];

  const dailyStats = new Map<string, { forgot: number; remembered: number }>();

  for (const card of allCards) {
    const history = card.repetitionHistory;
    if (!history) continue;

    for (const rep of history) {
      if (rep.date <= LIMIT) continue;

      const dayKey = new Date(rep.date).toDateString();
      const stats = dailyStats.get(dayKey) || { forgot: 0, remembered: 0 };

      if (rep.score === 0) {
        stats.forgot += 1;
      } else if (rep.score === 0.5 || rep.score === 1 || rep.score === 1.5) {
        stats.remembered += 1;
      }

      dailyStats.set(dayKey, stats);
    }
  }

  if (dailyStats.size === 0) return [];

  const result: { x: number; y: number }[] = [];
  for (const [dayKey, stats] of dailyStats) {
    const total = stats.forgot + stats.remembered;
    if (total === 0) continue;
    const retention = (stats.remembered / total) * 100;
    result.push({ x: new Date(dayKey).getTime(), y: Math.round(retention * 10) / 10 });
  }

  result.sort((a, b) => a.x - b.x);
  return result;
}

/**
 * Computes a simple moving average series from (x,y) data.
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
    if (i >= windowSize) {
      sum -= data[i - windowSize].y;
    }
    if (i >= windowSize - 1) {
      const avg = sum / windowSize;
      result.push({ x: data[i].x, y: Math.round(avg * 10) / 10 });
    }
  }

  return result;
}

/**
 * Computes cumulative average series from (x,y) data.
 */
export function getCumulativeAverageSeries(
  data: { x: number; y: number }[]
): { x: number; y: number }[] {
  if (!data || data.length === 0) return [];

  const result: { x: number; y: number }[] = [];
  let sum = 0;

  for (let i = 0; i < data.length; i++) {
    sum += data[i].y;
    const avg = sum / (i + 1);
    result.push({ x: data[i].x, y: Math.round(avg * 10) / 10 });
  }

  return result;
}

/**
 * Interpolates between two hex colors
 */
export function interpolateColor(color1: string, color2: string, factor: number = 0.5): string {
  if (!/^#[0-9A-F]{6}$/i.test(color1) || !/^#[0-9A-F]{6}$/i.test(color2)) {
    return color1; 
  }
  
  const r1 = parseInt(color1.substring(1, 3), 16);
  const g1 = parseInt(color1.substring(3, 5), 16);
  const b1 = parseInt(color1.substring(5, 7), 16);

  const r2 = parseInt(color2.substring(1, 3), 16);
  const g2 = parseInt(color2.substring(3, 5), 16);
  const b2 = parseInt(color2.substring(5, 7), 16);

  const r = Math.round(r1 + factor * (r2 - r1));
  const g = Math.round(g1 + factor * (g2 - g1));
  const b = Math.round(b1 + factor * (b2 - b1));

  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

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
  lastReviewDate: number | null;
}

/**
 * Gets the hardest cards based on retention rate (lowest retention = hardest)
 * Only includes cards with a minimum number of reviews to ensure statistical significance.
 * 
 * @param allCards - Array of all cards to analyze
 * @param limit - Maximum number of cards to return
 * @param minReviews - Minimum reviews required to be included (default: 3)
 * @returns Array of HardCardData sorted by retention rate (ascending = hardest first)
 */
export function getHardestCards(
  allCards: Card[] | undefined, 
  limit: number = 10,
  minReviews: number = 3
): HardCardData[] {
  if (!allCards || allCards.length === 0) return [];

  const cardStats: HardCardData[] = [];

  for (const card of allCards) {
    const history = card.repetitionHistory;
    if (!history || history.length < minReviews) continue;

    let forgotCount = 0;
    let rememberedCount = 0;
    let lastReviewDate: number | null = null;

    for (const rep of history) {
      if (rep.date <= LIMIT) continue;
      
      // Track last review date
      if (lastReviewDate === null || rep.date > lastReviewDate) {
        lastReviewDate = rep.date;
      }

      // Score 0 = Forgot, 0.5/1/1.5 = Hard/Good/Easy (remembered)
      if (rep.score === 0) {
        forgotCount++;
      } else if (rep.score === 0.5 || rep.score === 1 || rep.score === 1.5) {
        rememberedCount++;
      }
      // Skip score 0.01 (skipped cards)
    }

    const totalReviews = forgotCount + rememberedCount;
    if (totalReviews < minReviews) continue;

    const retentionRate = (rememberedCount / totalReviews) * 100;

    cardStats.push({
      cardId: card._id,
      remId: card.remId,
      totalReviews,
      forgotCount,
      rememberedCount,
      retentionRate: Math.round(retentionRate * 10) / 10,
      lastReviewDate
    });
  }

  // Sort by retention rate ascending (lowest = hardest) 
  // If same retention rate, sort by forgot count descending (more forgot = harder)
  cardStats.sort((a, b) => {
    if (a.retentionRate !== b.retentionRate) {
      return a.retentionRate - b.retentionRate;
    }
    return b.forgotCount - a.forgotCount;
  });

  return cardStats.slice(0, limit);
}

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

/**
 * Gets retention rate by time of day in 3-hour blocks
 * Shows when during the day the user has the best/worst retention
 * 
 * @param allCards - Array of all cards to analyze
 * @returns Array of TimeOfDayRetention for each 3-hour block
 */
export function getRetentionRateByTimeOfDay(allCards: Card[] | undefined): TimeOfDayRetention[] {
  if (!allCards || allCards.length === 0) return [];

  // Define 3-hour blocks (8 blocks total)
  const timeBlocks = [
    { label: '12 AM - 3 AM', startHour: 0 },
    { label: '3 AM - 6 AM', startHour: 3 },
    { label: '6 AM - 9 AM', startHour: 6 },
    { label: '9 AM - 12 PM', startHour: 9 },
    { label: '12 PM - 3 PM', startHour: 12 },
    { label: '3 PM - 6 PM', startHour: 15 },
    { label: '6 PM - 9 PM', startHour: 18 },
    { label: '9 PM - 12 AM', startHour: 21 }
  ];

  // Initialize stats for each block
  const blockStats = timeBlocks.map(block => ({
    timeBlock: block.label,
    startHour: block.startHour,
    forgotCount: 0,
    rememberedCount: 0,
    totalReviews: 0,
    retentionRate: 0
  }));

  // Process all reviews
  for (const card of allCards) {
    const history = card.repetitionHistory;
    if (!history) continue;

    for (const rep of history) {
      if (rep.date <= LIMIT) continue;

      // Get hour of the day (0-23)
      const date = new Date(rep.date);
      const hour = date.getHours();

      // Find which 3-hour block this belongs to
      const blockIndex = Math.floor(hour / 3);
      
      if (blockIndex < 0 || blockIndex >= 8) continue; // Safety check

      // Score 0 = Forgot, 0.5/1/1.5 = Hard/Good/Easy (remembered)
      if (rep.score === 0) {
        blockStats[blockIndex].forgotCount++;
      } else if (rep.score === 0.5 || rep.score === 1 || rep.score === 1.5) {
        blockStats[blockIndex].rememberedCount++;
      }
      // Skip score 0.01 (skipped cards)
    }
  }

  // Calculate retention rates
  for (const block of blockStats) {
    block.totalReviews = block.forgotCount + block.rememberedCount;
    if (block.totalReviews > 0) {
      block.retentionRate = Math.round((block.rememberedCount / block.totalReviews) * 1000) / 10;
    }
  }

  return blockStats;
}

/**
 * Represents time statistics for a specific day
 */
export interface DailyTimeStats {
  date: number; // Unix timestamp
  timeMs: number; // Total time in milliseconds
  reviewCount: number; // Number of reviews
  responseTimesMs: number[]; // Individual valid response times
}

/**
 * Gets time spent per day from card repetition history
 * @param allCards - Array of all cards to analyze
 * @param startLimit - Start date timestamp (default: 0)
 * @param endLimit - End date timestamp (default: Infinity)
 * @returns Array of daily time statistics
 */
export function getTimeSpentPerDay(
  allCards: Card[] | undefined,
  startLimit: number = 0,
  endLimit: number = Infinity
): DailyTimeStats[] {
  if (!allCards || allCards.length === 0) return [];

  const dailyStats = new Map<string, { timeMs: number; count: number; responseTimesMs: number[] }>();

  for (const card of allCards) {
    const history = card.repetitionHistory;
    if (!history) continue;

    for (const rep of history) {
      if (rep.date < startLimit || rep.date > endLimit) continue;
      if (rep.date <= LIMIT) continue;
      if (!rep.responseTime || rep.responseTime <= 0) continue;

      const dayKey = new Date(rep.date).toDateString();
      const stats = dailyStats.get(dayKey) || { timeMs: 0, count: 0, responseTimesMs: [] };
      stats.timeMs += rep.responseTime;
      stats.count += 1;
      stats.responseTimesMs.push(rep.responseTime);
      dailyStats.set(dayKey, stats);
    }
  }

  if (dailyStats.size === 0) return [];

  const result: DailyTimeStats[] = [];
  for (const [dayKey, stats] of dailyStats) {
    result.push({
      date: new Date(dayKey).getTime(),
      timeMs: stats.timeMs,
      reviewCount: stats.count,
      responseTimesMs: stats.responseTimesMs
    });
  }

  result.sort((a, b) => a.date - b.date);
  return result;
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
  const dayMs = 24 * 60 * 60 * 1000;
  const firstReviewDay = Math.min(...dailyData.map(day => day.date));
  const lastReviewDayEnd = new Date(Math.max(...dailyData.map(day => day.date)));
  lastReviewDayEnd.setDate(lastReviewDayEnd.getDate() + 1);
  const periodStart = startDate ?? firstReviewDay;
  const periodEnd = endDate ?? lastReviewDayEnd.getTime();
  const startDay = new Date(periodStart);
  const endDay = new Date(periodEnd);
  const startCalendarDay = Date.UTC(startDay.getFullYear(), startDay.getMonth(), startDay.getDate());
  const endCalendarDay = Date.UTC(endDay.getFullYear(), endDay.getMonth(), endDay.getDate());
  const totalDaysInPeriod = Math.max(
    Math.round((endCalendarDay - startCalendarDay) / dayMs),
    dailyData.length
  );

  const averageTimePerDay = totalDaysInPeriod > 0 ? totalTimeMs / totalDaysInPeriod : 0;
  const averageTimePerReviewDay = daysWithReviews > 0 ? totalTimeMs / daysWithReviews : 0;
  const averageTimePerCard = totalReviews > 0 ? totalTimeMs / totalReviews : 0;
  
  // Cards per minute: (totalReviews / (totalTimeMs / 60000))
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
 * @param format - Format type ('short' for "1h 23m", 'long' for "1 hour 23 minutes", 'hours' for "1.38h")
 * @returns Formatted time string
 */
export function formatTime(ms: number, format: 'short' | 'long' | 'hours' | 'seconds' = 'short'): string {
  if (ms === 0) {
    if (format === 'hours') return '0.00h';
    if (format === 'seconds') return '0.00s';
    return '0s';
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (format === 'hours') {
    const hoursDecimal = ms / (1000 * 60 * 60);
    return `${hoursDecimal.toFixed(2)}h`;
  }

  if (format === 'seconds') {
    const secondsDecimal = ms / 1000;
    return `${secondsDecimal.toFixed(2)}s`;
  }

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
