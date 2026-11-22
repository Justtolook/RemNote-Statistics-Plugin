import Chart from 'react-apexcharts';
import React from 'react';
import { getCommonChartOptions } from '../../lib/chartHelpers';
import {
  DailyTimeStats,
  DueForecast,
  formatTime,
  RecallSpeedDataPoint,
  RecallSpeedSummary,
  ResponseTimeDistribution,
  TimeOfDayRetention,
  TimeStatsSummary,
} from '../../lib/dataProcessing';
import { MetricCard } from '../statisticsComponents';

type Point = { x: number; y: number };

function NoData({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-8 text-center opacity-60">
      <div className="text-sm">{title}</div>
      <div className="text-xs mt-1">{description}</div>
    </div>
  );
}

const textColor = 'var(--rn-clr-content-primary)';

// ---------------------------------------------------------------------------

interface HeatmapChartProps {
  data: Point[];
  colorLow: string;
  colorMedium: string;
  colorHigh: string;
  midPoint: number;
  target: number;
}

const WEEKDAYS_BOTTOM_UP = ['Sunday', 'Saturday', 'Friday', 'Thursday', 'Wednesday', 'Tuesday', 'Monday'] as const;
const WEEKDAY_INDEX: Record<typeof WEEKDAYS_BOTTOM_UP[number], number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
};

export function HeatmapChart({ data, colorLow, colorMedium, colorHigh, midPoint, target }: HeatmapChartProps) {
  const options = {
    xaxis: {
      type: 'datetime' as const,
      labels: { style: { colors: textColor } },
      tooltip: { enabled: false }
    },
    chart: {
      zoom: { enabled: false },
      toolbar: { show: false },
      foreColor: textColor,
      background: 'transparent'
    },
    dataLabels: { enabled: false },
    legend: {
      show: true,
      position: 'top' as const,
      horizontalAlign: 'right' as const,
      labels: { colors: textColor },
    },
    colors: [colorHigh],
    plotOptions: {
      heatmap: {
        shadeIntensity: 0.5,
        radius: 2,
        useFillColorAsStroke: false,
        colorScale: {
          ranges: [
            { from: 0, to: 0, color: 'var(--rn-clr-background-tertiary)', name: '0' },
            { from: 1, to: midPoint, color: colorLow, name: `Low: 1 - ${midPoint}` },
            { from: midPoint + 1, to: target, color: colorMedium, name: `Medium: ${midPoint + 1} - ${target}` },
            { from: target + 1, to: 1000000, color: colorHigh, name: `High: > ${target}` },
          ]
        }
      }
    },
    stroke: { width: 1, colors: ['var(--rn-clr-background-primary)'] },
    tooltip: {
      theme: 'light',
      x: { show: true, format: 'dd MMM yyyy' },
      y: { formatter: (val: number) => `${val} reviews` }
    }
  };

  const series = WEEKDAYS_BOTTOM_UP.map(name => ({
    name,
    data: data.filter(point => new Date(point.x).getDay() === WEEKDAY_INDEX[name]),
  }));

  return (
    <div className="mt-4">
      <Chart options={options} series={series} type="heatmap" width="100%" height="250" />
    </div>
  );
}

// ---------------------------------------------------------------------------

interface DueForecastChartProps {
  forecast: DueForecast;
  typicalResponseMs?: number;
  accent: string;
}

export function DueForecastChart({ forecast, typicalResponseMs, accent }: DueForecastChartProps) {
  const days = forecast.days;
  let running = 0;
  const cumulative = days.map(day => (running += day.due + day.overdue));
  const estimate = (cards: number) => typicalResponseMs ? ` · ≈ ${formatTime(cards * typicalResponseMs)}` : '';
  const common = getCommonChartOptions('Due cards per day', 'datetime', accent);

  const options = {
    ...common,
    chart: { ...common.chart, stacked: true },
    colors: ['#ef4444', accent],
    dataLabels: { enabled: false },
    legend: {
      show: forecast.overdueCount > 0,
      position: 'top' as const,
      horizontalAlign: 'right' as const,
      labels: { colors: textColor },
    },
    xaxis: { ...common.xaxis, tickAmount: 'dataPoints' as const },
    tooltip: {
      shared: true,
      intersect: false,
      custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
        const day = days[dataPointIndex];
        if (!day) return '';
        const total = day.due + day.overdue;
        const date = new Date(day.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
        return `<div style="padding: 8px 12px; line-height: 1.5">
          <strong>${date}</strong><br />
          ${day.overdue > 0 ? `Overdue: ${day.overdue}<br />` : ''}
          Due: ${day.due}<br />
          Total: ${total}${estimate(total)}<br />
          Cumulative: ${cumulative[dataPointIndex]}${estimate(cumulative[dataPointIndex])}
        </div>`;
      }
    }
  };

  return (
    <Chart
      options={options}
      type="bar"
      width="100%"
      height="300"
      series={[
        { name: 'Overdue', data: days.map(day => [day.date, day.overdue]) },
        { name: 'Due', data: days.map(day => [day.date, day.due]) },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------

interface ColumnWithPercentChartProps {
  data: Array<{ x: string; y: number }>;
  title: string;
  total: number;
  accent: string;
}

export function ColumnWithPercentChart({ data, title, total, accent }: ColumnWithPercentChartProps) {
  const percent = (val: number) => total === 0 ? '0%' : `${((val / total) * 100).toFixed(1)}%`;
  const options = {
    ...getCommonChartOptions(title, 'category', accent),
    dataLabels: {
      enabled: true,
      formatter: (val: number) => percent(val),
      style: { colors: [textColor] },
      offsetY: -20,
    },
    plotOptions: { bar: { dataLabels: { position: 'top' as const } } },
    tooltip: { y: { formatter: (val: number) => total === 0 ? String(val) : `${val} (${percent(val)})` } }
  };

  return <Chart options={options} type="bar" width="100%" height="300" series={[{ name: 'Count', data }]} />;
}

interface ColumnChartProps {
  data: Point[];
  title: string;
  accent: string;
}

export function ColumnChart({ data, title, accent }: ColumnChartProps) {
  const common = getCommonChartOptions(title, 'category', accent);
  const options = {
    ...common,
    dataLabels: { enabled: false },
    xaxis: { ...common.xaxis, tickAmount: 'dataPoints' as const },
  };

  return <Chart options={options} type="bar" width="100%" height="300" series={[{ name: 'Cards', data }]} />;
}

// ---------------------------------------------------------------------------

export function CumulativeReviewsChart({ series, accent }: { series: [number, number][]; accent: string }) {
  const options = {
    ...getCommonChartOptions('Sum of reviews over time', 'datetime', accent),
    dataLabels: { enabled: false },
    stroke: { colors: [accent], curve: 'smooth' as const },
    fill: { type: 'solid' as const, colors: [accent] },
    tooltip: { enabled: true, x: { format: 'dd MMM yyyy' } },
  };

  return <Chart options={options} series={[{ name: 'Total Reviews', data: series }]} type="area" width="100%" height="300" />;
}

// ---------------------------------------------------------------------------

interface RetentionOverTimeChartProps {
  daily: Point[];
  weekly: Point[];
  monthly: Point[];
  cumulative: Point[];
  target?: number;
  accent: string;
}

export function RetentionOverTimeChart({ daily, weekly, monthly, cumulative, target, accent }: RetentionOverTimeChartProps) {
  if (!daily || daily.length === 0) return null;

  const options = {
    ...getCommonChartOptions('Retention rate over time', 'datetime', accent),
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth' as const, width: [3, 2, 2, 2], dashArray: [0, 4, 6, 2] },
    colors: [accent, '#10b981', '#f59e0b', '#8b5cf6'],
    legend: {
      show: true,
      position: 'top' as const,
      horizontalAlign: 'right' as const,
      labels: { colors: textColor },
      onItemClick: { toggleDataSeries: true },
      onItemHover: { highlightDataSeries: true }
    },
    yaxis: {
      min: 0,
      max: 100,
      tickAmount: 5,
      labels: { style: { colors: textColor }, formatter: (val: number) => `${val.toFixed(0)}%` }
    },
    annotations: target ? {
      yaxis: [{
        y: target,
        borderColor: '#ef4444',
        strokeDashArray: 4,
        label: {
          text: `Target ${target}%`,
          position: 'left',
          textAnchor: 'start',
          style: { background: '#ef4444', color: '#fff', fontSize: '10px' },
        },
      }],
    } : undefined,
    tooltip: {
      theme: 'light' as const,
      x: { format: 'dd MMM yyyy' },
      y: { formatter: (val: number) => `${val.toFixed(1)}%` }
    },
    markers: { size: 0, hover: { size: 5 } }
  };

  const series = [
    { name: 'Daily', data: daily },
    { name: '7-day', data: weekly },
    { name: '30-day', data: monthly },
    { name: 'Cumulative', data: cumulative },
  ];

  return (
    <div>
      <Chart options={options} type="line" width="100%" height="300" series={series} />
      <div className="response-summary-note">
        The 7- and 30-day lines cover calendar days and weight each day by its number of reviews.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const retentionColor = (rate: number) => {
  if (rate >= 80) return '#10b981';
  if (rate >= 70) return '#84cc16';
  if (rate >= 60) return '#eab308';
  if (rate >= 50) return '#f97316';
  return '#ef4444';
};

export function RetentionByTimeOfDayChart({ data, accent }: { data: TimeOfDayRetention[]; accent: string }) {
  const blocks = (data || []).filter(block => block.totalReviews > 0);
  if (blocks.length === 0) {
    return <NoData title="No data available" description="Review some flashcards to see your productivity patterns" />;
  }

  const chartData = blocks.map(block => ({
    x: block.timeBlock,
    y: block.retentionRate,
    reviews: block.totalReviews,
    forgot: block.forgotCount,
    remembered: block.rememberedCount
  }));
  const bestBlock = blocks.reduce((max, block) => block.retentionRate > max.retentionRate ? block : max, blocks[0]);
  const common = getCommonChartOptions('Retention rate by time of day', 'category', accent);

  const options = {
    ...common,
    dataLabels: {
      enabled: true,
      formatter: (val: number) => `${val.toFixed(1)}%`,
      style: { colors: [textColor], fontSize: '11px', fontWeight: 600 },
      offsetY: -20,
    },
    plotOptions: { bar: { dataLabels: { position: 'top' as const }, distributed: true, borderRadius: 4 } },
    colors: chartData.map(d => retentionColor(d.y)),
    xaxis: {
      ...common.xaxis,
      labels: { style: { colors: textColor }, rotate: -45, rotateAlways: true, hideOverlappingLabels: false }
    },
    yaxis: {
      min: 0,
      max: 100,
      tickAmount: 5,
      labels: { style: { colors: textColor }, formatter: (val: number) => `${val.toFixed(0)}%` }
    },
    tooltip: {
      theme: 'light' as const,
      y: {
        formatter: (val: number, opts: any) => {
          const point = chartData[opts.dataPointIndex];
          return `
            <div style="padding: 4px 0;">
              <div><strong>Retention:</strong> ${val.toFixed(1)}%</div>
              <div><strong>Total Reviews:</strong> ${point.reviews}</div>
              <div><strong>Remembered:</strong> ${point.remembered}</div>
              <div><strong>Forgot:</strong> ${point.forgot}</div>
            </div>
          `;
        },
        title: { formatter: () => '' }
      }
    },
    legend: { show: false }
  };

  return (
    <div>
      <MetricCard
        className="mb-4 md:mb-6"
        label="🎯 Most Productive Time"
        value={bestBlock.timeBlock}
        supporting={`${bestBlock.retentionRate.toFixed(1)}% retention rate (${bestBlock.totalReviews} reviews)`}
        accent="#10b981"
      />
      <Chart options={options} type="bar" width="100%" height="300" series={[{ name: 'Retention Rate', data: chartData }]} />
    </div>
  );
}

// ---------------------------------------------------------------------------

interface TimeSpentChartProps {
  data: DailyTimeStats[];
  summary: TimeStatsSummary;
  maxAnswerSeconds: number;
  accent: string;
}

export function TimeSpentChart({ data, summary, maxAnswerSeconds, accent }: TimeSpentChartProps) {
  if (!data || data.length === 0) {
    return <NoData title="No time data available" description="Time tracking data will appear as you review flashcards" />;
  }

  const chartData = data.map(day => ({ x: day.date, y: Math.round((day.timeMs / 60000) * 10) / 10 }));
  let cumulativeTimeMs = 0;
  const cumulativeData = data.map(day => {
    cumulativeTimeMs += day.timeMs;
    return { x: day.date, y: Math.round((cumulativeTimeMs / 3600000) * 100) / 100 };
  });
  const common = getCommonChartOptions('Time spent reviewing', 'datetime', accent);

  const options = {
    ...common,
    dataLabels: { enabled: false },
    stroke: { width: [0, 2], curve: 'smooth' as const },
    fill: {
      type: ['solid', 'gradient'],
      gradient: {
        shade: 'light',
        type: 'vertical',
        shadeIntensity: 0.25,
        inverseColors: false,
        opacityFrom: 0.5,
        opacityTo: 0.1,
        stops: [0, 100]
      }
    },
    plotOptions: { bar: { borderRadius: 2, columnWidth: '85%' } },
    colors: ['#f59e0b', accent],
    xaxis: {
      ...common.xaxis,
      type: 'datetime' as const,
      labels: { format: 'MMM dd', style: { colors: textColor } }
    },
    yaxis: [
      {
        seriesName: 'Daily Time',
        decimalsInFloat: 1,
        labels: { style: { colors: textColor }, formatter: (val: number) => `${val.toFixed(1)}m` },
        title: { text: 'Time (minutes)', style: { color: textColor } }
      },
      {
        seriesName: 'Cumulative Time',
        opposite: true,
        decimalsInFloat: 1,
        labels: { style: { colors: textColor }, formatter: (val: number) => `${val.toFixed(1)}h` },
        title: { text: 'Cumulative Time (hours)', style: { color: textColor } }
      }
    ],
    tooltip: {
      theme: 'light' as const,
      x: { format: 'dd MMM yyyy' },
      y: {
        formatter: (val: number, opts: any) => opts.seriesIndex === 0
          ? `${val.toFixed(1)} minutes (${data[opts.dataPointIndex]?.reviewCount || 0} reviews)`
          : `${val.toFixed(2)} hours total`
      }
    },
    legend: { show: true, position: 'top' as const, horizontalAlign: 'center' as const, labels: { colors: textColor } }
  };

  return (
    <div>
      <div className="metric-grid metric-grid-five mb-4 md:mb-6">
        <MetricCard label="Total Time" value={formatTime(summary.totalTimeMs, 'hours')} accent="#f59e0b" />
        <MetricCard label="Avg per Day" value={formatTime(summary.averageTimePerDay)} accent="#f59e0b" />
        <MetricCard label="Avg per Study Day" value={formatTime(summary.averageTimePerReviewDay)} accent="#f59e0b" />
        <MetricCard
          label="Avg per Card"
          value={<>{formatTime(summary.averageTimePerCard, 'seconds')} <span className="text-xs opacity-60">({summary.cardsPerMinute.toFixed(1)}/min)</span></>}
          accent="#f59e0b"
        />
        <MetricCard
          label="Days Studied"
          value={`${summary.daysWithReviews} of ${summary.totalDaysInPeriod}`}
          supporting={`${summary.percentageDaysStudied.toFixed(1)}% of days in period`}
          accent="#f59e0b"
        />
      </div>

      <Chart
        options={options}
        type="line"
        width="100%"
        height="300"
        series={[
          { name: 'Daily Time', type: 'bar', data: chartData },
          { name: 'Cumulative Time', type: 'area', data: cumulativeData }
        ]}
      />
      {maxAnswerSeconds > 0 && (
        <div className="response-summary-note">
          Answers longer than {maxAnswerSeconds}s count as {maxAnswerSeconds}s (change this in the plugin settings).
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface RecallSpeedChartProps {
  daily: RecallSpeedDataPoint[];
  movingAverage: RecallSpeedDataPoint[];
  summary: RecallSpeedSummary | undefined;
  accent: string;
}

export function RecallSpeedChart({ daily, movingAverage, summary, accent }: RecallSpeedChartProps) {
  if (!daily || daily.length === 0) {
    return <NoData title="No recall-speed data available" description="Response-time trends will appear as you review flashcards" />;
  }

  const toSeries = (points: RecallSpeedDataPoint[], pick: (p: RecallSpeedDataPoint) => number) =>
    points.map(point => ({ x: point.date, y: pick(point) / 1000 }));
  const remainingDaysForComparison = Math.max(0, 14 - daily.length);
  const comparison = summary?.comparison;
  const comparisonColor = comparison?.direction === 'faster'
    ? '#10b981'
    : comparison?.direction === 'slower' ? '#ef4444' : textColor;
  const comparisonText = comparison
    ? comparison.direction === 'unchanged'
      ? 'No change from the previous 7 study days'
      : `${formatTime(Math.abs(comparison.differenceMs), 'seconds')} ${comparison.direction} (${Math.abs(comparison.percentageChange).toFixed(1)}%)`
    : remainingDaysForComparison > 0
      ? `Compare after ${remainingDaysForComparison} more study day${remainingDaysForComparison === 1 ? '' : 's'}`
      : 'Comparison unavailable';
  const common = getCommonChartOptions('Recall speed over time', 'datetime', accent);

  const options = {
    ...common,
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth' as const, width: [2, 2, 3], dashArray: [0, 3, 5] },
    colors: [accent, '#8b5cf6', '#f59e0b'],
    xaxis: { ...common.xaxis, type: 'datetime' as const, labels: { format: 'MMM dd', style: { colors: textColor } } },
    yaxis: {
      min: 0,
      labels: { style: { colors: textColor }, formatter: (val: number) => `${val.toFixed(1)}s` },
      title: { text: 'Response time (seconds/card)', style: { color: textColor } }
    },
    tooltip: {
      theme: 'light' as const,
      x: { format: 'dd MMM yyyy' },
      y: {
        formatter: (val: number, opts: any) => {
          if (opts.seriesIndex === 0) {
            const point = daily[opts.dataPointIndex];
            return `${val.toFixed(2)} seconds/card (${point?.reviewCount || 0} of ${point?.totalReviewCount || 0} timed reviews retained)`;
          }
          if (opts.seriesIndex === 1) return `${val.toFixed(2)} seconds/card (daily median)`;
          return `${val.toFixed(2)} seconds/card (7-study-day average)`;
        }
      }
    },
    markers: { size: [3, 3, 0], hover: { size: 5 } },
    legend: {
      show: true,
      position: 'top' as const,
      horizontalAlign: 'right' as const,
      labels: { colors: textColor },
      onItemClick: { toggleDataSeries: true },
      onItemHover: { highlightDataSeries: true }
    }
  };

  return (
    <div>
      <div className="metric-grid metric-grid-two mb-3 md:mb-4">
        <MetricCard
          label="Response Time"
          value={`${formatTime(summary?.averageResponseTimeMs || 0, 'seconds')}/card`}
          supporting={`Latest ${summary?.studyDaysIncluded || 0} study day${summary?.studyDaysIncluded === 1 ? '' : 's'}`}
          accent={accent}
        />
        <MetricCard
          label="Trend"
          value={comparisonText}
          supporting={comparison ? `Previous: ${formatTime(comparison.averageResponseTimeMs, 'seconds')}/card` : undefined}
          accent={comparisonColor}
        />
      </div>
      <div className="response-summary-note mb-4 md:mb-6">
        Daily averages and medians use the 5th–95th percentile of response times.
      </div>

      <Chart
        options={options}
        type="line"
        width="100%"
        height="300"
        series={[
          { name: 'Daily Response Time', data: toSeries(daily, p => p.averageResponseTimeMs) },
          { name: 'Daily Median Response Time', data: toSeries(daily, p => p.medianResponseTimeMs ?? 0) },
          { name: '7 Study Day Average', data: toSeries(movingAverage, p => p.averageResponseTimeMs) }
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

interface ResponseTimeDistributionChartProps {
  distribution: ResponseTimeDistribution | undefined;
  accent: string;
}

export function ResponseTimeDistributionChart({ distribution, accent }: ResponseTimeDistributionChartProps) {
  if (!distribution) {
    return <NoData title="No response-time data available" description="A distribution will appear as you review flashcards" />;
  }

  const toSeconds = (milliseconds: number) => milliseconds / 1000;
  const formatStatistic = (milliseconds: number) => `${formatTime(milliseconds, 'seconds')}/card`;
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const distributionSummary = `${distribution.reviewCount.toLocaleString()} timed reviews · average ${formatStatistic(distribution.averageMs)} · ${plural(distribution.lowOutlierCount, 'low outlier')} · ${plural(distribution.highOutlierCount, 'high outlier')}`;
  const common = getCommonChartOptions('Response time distribution', 'category', accent);

  const options = {
    ...common,
    subtitle: {
      text: distributionSummary,
      align: 'left' as const,
      offsetY: 24,
      style: { color: 'var(--rn-clr-content-secondary)', fontSize: '11px', fontWeight: 400 }
    },
    plotOptions: {
      bar: { horizontal: true },
      boxPlot: { colors: { upper: '#8b5cf6', lower: accent } }
    },
    xaxis: {
      ...common.xaxis,
      labels: {
        formatter: (value: string) => {
          const seconds = Number(value);
          return Number.isFinite(seconds) ? `${seconds.toFixed(1)}s` : value;
        },
        style: { colors: textColor }
      },
      title: { text: 'Response time (seconds/card)', style: { color: textColor } }
    },
    annotations: {
      xaxis: [{
        x: toSeconds(distribution.averageMs),
        borderColor: '#f59e0b',
        strokeDashArray: 4,
        label: {
          text: `Average: ${formatStatistic(distribution.averageMs)}`,
          style: { background: '#f59e0b', color: '#1f2937', fontSize: '10px' }
        }
      }]
    },
    yaxis: { labels: { style: { colors: textColor } } },
    tooltip: {
      theme: 'light' as const,
      custom: () => `<div style="padding: 8px 12px; line-height: 1.5">
          <strong>Selected period</strong><br />
          ${distribution.reviewCount} timed reviews<br />
          Average: ${formatStatistic(distribution.averageMs)}<br />
          Lower whisker: ${formatStatistic(distribution.lowerWhiskerMs)}<br />
          Q1: ${formatStatistic(distribution.q1Ms)}<br />
          Median: ${formatStatistic(distribution.medianMs)}<br />
          Q3: ${formatStatistic(distribution.q3Ms)}<br />
          Upper whisker: ${formatStatistic(distribution.upperWhiskerMs)}<br />
          Outliers: ${distribution.lowOutlierCount} low, ${distribution.highOutlierCount} high
        </div>`
    },
    legend: { show: false }
  };

  const boxPlotData = [{
    x: 'Selected period',
    y: [
      distribution.lowerWhiskerMs,
      distribution.q1Ms,
      distribution.medianMs,
      distribution.q3Ms,
      distribution.upperWhiskerMs,
    ].map(toSeconds)
  }];

  return (
    <Chart
      options={options}
      type="boxPlot"
      width="100%"
      height="280"
      series={[{ name: 'Response Time Distribution', data: boxPlotData }]}
    />
  );
}
