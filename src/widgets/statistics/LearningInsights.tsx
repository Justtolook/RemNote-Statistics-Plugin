import Chart from 'react-apexcharts';
import React from 'react';
import { getCommonChartOptions } from '../../lib/chartHelpers';
import { formatTime } from '../../lib/dataProcessing';
import {
  FATIGUE_BASELINE_MINUTES,
  FATIGUE_DROP_POINTS,
  FatigueCurve,
  ForgettingCurve,
  MIN_REVIEWS_FOR_INSIGHT,
} from '../../lib/insights';
import { MetricCard, SectionHeader } from '../statisticsComponents';

const textColor = 'var(--rn-clr-content-primary)';
const GREEN = '#10b981';
const AMBER = '#f59e0b';
const RED = '#ef4444';
const MUTED = '#9ca3af';

function InsightCallout({ tone, children }: { tone: 'good' | 'warn' | 'neutral'; children: React.ReactNode }) {
  const color = tone === 'good' ? GREEN : tone === 'warn' ? AMBER : 'var(--rn-clr-border-primary)';
  return (
    <div className="insight-callout" style={{ borderLeftColor: color }} role="note">
      {children}
    </div>
  );
}

/** A percentage axis from a round minimum to 100% with 10- or 20-point steps. */
const percentAxis = (rates: Array<number | undefined>, reference: number) => {
  const lowest = Math.min(reference, ...rates.filter((rate): rate is number => rate !== undefined));
  let min = Math.max(0, Math.floor((lowest - 5) / 10) * 10);
  let step = 10;
  if ((100 - min) / step > 6) {
    step = 20;
    min = Math.floor(min / 20) * 20;
  }
  return { min, max: 100, tickAmount: (100 - min) / step, forceNiceScale: false };
};

// ---------------------------------------------------------------------------

interface ForgettingCurveViewProps {
  curve: ForgettingCurve;
  target: number;
  accent: string;
}

function ForgettingCurveView({ curve, target, accent }: ForgettingCurveViewProps) {
  const { buckets, verdict } = curve;

  let callout: React.ReactNode;
  if (verdict.kind === 'not-enough-data') {
    callout = (
      <InsightCallout tone="neutral">
        Not enough data yet. Each interval needs at least {MIN_REVIEWS_FOR_INSIGHT} reviews in the selected period. Try a longer period.
      </InsightCallout>
    );
  } else if (verdict.kind === 'on-target') {
    callout = verdict.allAbove ? (
      <InsightCallout tone="good">
        <strong>You stay above your {target}% target at every interval</strong> with enough data, up to {verdict.longestReliable.label}.
        {' '}Your reviews could be spaced further apart for the same result, which means less work.
      </InsightCallout>
    ) : (
      <InsightCallout tone="good">
        <strong>You stay around your {target}% target at every interval</strong> with enough data, up to {verdict.longestReliable.label}.
        {' '}Amber bars are slightly below target, but within what chance would explain.
      </InsightCallout>
    );
  } else {
    const below = verdict.firstBelow;
    callout = (
      <InsightCallout tone="warn">
        {verdict.lastOnTarget
          ? <>You stay around your {target}% target up to <strong>{verdict.lastOnTarget.label}</strong>. </>
          : <>Even at the shortest intervals you are clearly below your {target}% target. </>}
        At <strong>{below.label}</strong> you recall only {below.retentionRate?.toFixed(1)}%.
        {' '}Cards at these intervals come back too late for your target: reviewing them earlier, or rewording the ones that fail, would help.
      </InsightCallout>
    );
  }

  if (buckets.length === 0) return <div>{callout}</div>;

  const barColor = (index: number) => {
    const bucket = buckets[index];
    if (!bucket || !bucket.reliable || bucket.retentionRate === undefined) return MUTED;
    if (bucket.retentionRate >= target) return GREEN;
    if (bucket.retentionRate >= target - 5) return AMBER;
    return RED;
  };
  const common = getCommonChartOptions('Recall by time since last review', 'category', accent);

  const options = {
    ...common,
    plotOptions: { bar: { distributed: true, borderRadius: 4, columnWidth: '65%' } },
    colors: buckets.map((_, index) => barColor(index)),
    dataLabels: {
      enabled: true,
      formatter: (val: number, opts: any) => buckets[opts.dataPointIndex]?.total ? `${val.toFixed(0)}%` : '',
      style: { colors: [textColor], fontSize: '11px', fontWeight: 600 },
      offsetY: -20,
    },
    legend: { show: false },
    xaxis: {
      ...common.xaxis,
      labels: { style: { colors: textColor }, rotate: -45, hideOverlappingLabels: false },
      title: { text: 'Days since the previous review', style: { color: textColor } },
    },
    yaxis: {
      ...percentAxis(buckets.map(bucket => bucket.reliable ? bucket.retentionRate : undefined), target),
      labels: { style: { colors: textColor }, formatter: (val: number) => `${val.toFixed(0)}%` },
    },
    annotations: {
      yaxis: [{
        y: target,
        borderColor: RED,
        strokeDashArray: 4,
        label: { text: `Target ${target}%`, position: 'left', textAnchor: 'start', style: { background: RED, color: '#fff', fontSize: '10px' } },
      }],
    },
    tooltip: {
      custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
        const bucket = buckets[dataPointIndex];
        if (!bucket) return '';
        if (bucket.total === 0) return `<div style="padding: 8px 12px"><strong>${bucket.label}</strong><br />No reviews</div>`;
        return `<div style="padding: 8px 12px; line-height: 1.5">
          <strong>${bucket.label}</strong><br />
          Recalled: ${bucket.retentionRate?.toFixed(1)}% (${bucket.remembered} of ${bucket.total})<br />
          95% range: ${bucket.lowerBound?.toFixed(0)}–${bucket.upperBound?.toFixed(0)}%
          ${bucket.reliable ? '' : `<br /><em>Fewer than ${MIN_REVIEWS_FOR_INSIGHT} reviews: not used for the verdict</em>`}
        </div>`;
      },
    },
  };

  return (
    <div>
      {callout}
      <Chart
        options={options}
        type="bar"
        width="100%"
        height="300"
        series={[{ name: 'Recall', data: buckets.map(bucket => ({ x: bucket.label, y: bucket.retentionRate ?? 0 })) }]}
      />
      <div className="response-summary-note">
        Grey bars have fewer than {MIN_REVIEWS_FOR_INSIGHT} reviews. First reviews and same-day repeats are left out.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface FatigueCurveViewProps {
  curve: FatigueCurve;
  accent: string;
}

function FatigueCurveView({ curve, accent }: FatigueCurveViewProps) {
  const { buckets, sessions, verdict } = curve;

  let callout: React.ReactNode;
  if (verdict.kind === 'not-enough-data') {
    callout = (
      <InsightCallout tone="neutral">
        Not enough data yet. This needs at least {MIN_REVIEWS_FOR_INSIGHT} reviews in the first {FATIGUE_BASELINE_MINUTES} minutes of your sessions
        and in at least one later 5-minute slot. Try a longer period.
      </InsightCallout>
    );
  } else if (verdict.kind === 'no-drop') {
    callout = (
      <InsightCallout tone="good">
        <strong>No fatigue detected.</strong> Your retention stays around {verdict.baselineRate.toFixed(0)}% in sessions of up to {verdict.testedUpToMinute} minutes.
      </InsightCallout>
    );
  } else {
    callout = (
      <InsightCallout tone="warn">
        <strong>After about {verdict.afterMinute} minutes</strong> your retention drops from {verdict.baselineRate.toFixed(0)}% to {verdict.droppedRate.toFixed(0)}%
        {verdict.slowdownPercent !== undefined && verdict.slowdownPercent >= 10 ? <> and you answer {verdict.slowdownPercent}% slower</> : null}.
        {' '}A short break around minute {verdict.afterMinute} should help. {verdict.sessionsLongerShare.toFixed(0)}% of your sessions run longer than that.
      </InsightCallout>
    );
  }

  const recommended = verdict.kind === 'drop' ? `${verdict.afterMinute} min` : verdict.kind === 'no-drop' ? 'No limit found' : '–';

  const metrics = (
    <div className="metric-grid metric-grid-four mb-4 md:mb-6">
      <MetricCard label="Sessions" value={sessions.sessions.toLocaleString()} supporting="Pauses over 10 min start a new one" accent={accent} />
      <MetricCard label="Typical Length" value={`${sessions.medianDurationMinutes.toFixed(0)} min`} supporting="Median session" accent={accent} />
      <MetricCard label="Typical Reviews" value={sessions.medianReviews.toLocaleString()} supporting="Median per session" accent={accent} />
      <MetricCard
        label="Break After"
        value={recommended}
        supporting={verdict.kind === 'drop' ? `Retention −${(verdict.baselineRate - verdict.droppedRate).toFixed(0)} pts after this` : 'Based on your retention'}
        accent={verdict.kind === 'drop' ? AMBER : GREEN}
      />
    </div>
  );

  if (buckets.length === 0) return <div>{callout}{metrics}</div>;

  const baseline = verdict.kind === 'drop' || verdict.kind === 'no-drop' ? verdict.baselineRate : undefined;
  const barColor = ({ dataPointIndex }: { dataPointIndex: number }) => {
    const bucket = buckets[dataPointIndex];
    if (!bucket || !bucket.reliable) return MUTED;
    if (baseline !== undefined && bucket.startMinute >= FATIGUE_BASELINE_MINUTES
      && (bucket.retentionRate ?? 100) <= baseline - FATIGUE_DROP_POINTS) return RED;
    return accent;
  };
  const common = getCommonChartOptions('Retention and speed by minutes into a session', 'category', accent);
  const dropLabel = verdict.kind === 'drop' ? buckets.find(bucket => bucket.startMinute === verdict.afterMinute)?.label : undefined;

  const options = {
    ...common,
    chart: { ...common.chart, stacked: false },
    colors: [barColor, AMBER],
    stroke: { width: [0, 3], curve: 'smooth' as const },
    plotOptions: { bar: { borderRadius: 3, columnWidth: '65%' } },
    dataLabels: { enabled: false },
    markers: { size: [0, 4] },
    legend: { show: true, position: 'top' as const, horizontalAlign: 'right' as const, labels: { colors: textColor } },
    xaxis: {
      ...common.xaxis,
      labels: { style: { colors: textColor }, rotate: -45, hideOverlappingLabels: false },
      title: { text: 'Minutes into the session', style: { color: textColor } },
    },
    yaxis: [
      {
        seriesName: 'Retention',
        ...percentAxis(buckets.map(bucket => bucket.reliable ? bucket.retentionRate : undefined), baseline ?? 100),
        labels: { style: { colors: textColor }, formatter: (val: number) => `${val.toFixed(0)}%` },
        title: { text: 'Retention', style: { color: textColor } },
      },
      {
        seriesName: 'Median answer time',
        opposite: true,
        min: 0,
        labels: { style: { colors: textColor }, formatter: (val: number) => `${val.toFixed(1)}s` },
        title: { text: 'Median answer time', style: { color: textColor } },
      },
    ],
    annotations: {
      yaxis: baseline !== undefined ? [{
        y: baseline,
        borderColor: GREEN,
        strokeDashArray: 4,
        label: { text: `First ${FATIGUE_BASELINE_MINUTES} min: ${baseline.toFixed(0)}%`, position: 'left', textAnchor: 'start', style: { background: GREEN, color: '#fff', fontSize: '10px' } },
      }] : [],
      xaxis: dropLabel ? [{
        x: dropLabel,
        borderColor: RED,
        strokeDashArray: 4,
        label: { text: 'Fatigue', orientation: 'horizontal', style: { background: RED, color: '#fff', fontSize: '10px' } },
      }] : [],
    },
    tooltip: {
      shared: true,
      intersect: false,
      custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
        const bucket = buckets[dataPointIndex];
        if (!bucket) return '';
        if (bucket.total === 0) return `<div style="padding: 8px 12px"><strong>${bucket.label}</strong><br />No reviews</div>`;
        return `<div style="padding: 8px 12px; line-height: 1.5">
          <strong>${bucket.label}</strong><br />
          Retention: ${bucket.retentionRate?.toFixed(1)}% (${bucket.remembered} of ${bucket.total})<br />
          95% range: ${bucket.lowerBound?.toFixed(0)}–${bucket.upperBound?.toFixed(0)}%<br />
          Median answer time: ${bucket.medianResponseMs !== undefined ? formatTime(bucket.medianResponseMs, 'seconds') : '–'}
          ${bucket.reliable ? '' : `<br /><em>Fewer than ${MIN_REVIEWS_FOR_INSIGHT} reviews: not used for the verdict</em>`}
        </div>`;
      },
    },
  };

  return (
    <div>
      {callout}
      {metrics}
      <Chart
        options={options}
        type="line"
        width="100%"
        height="320"
        series={[
          { name: 'Retention', type: 'column', data: buckets.map(bucket => ({ x: bucket.label, y: bucket.retentionRate ?? 0 })) },
          { name: 'Median answer time', type: 'line', data: buckets.map(bucket => ({ x: bucket.label, y: bucket.medianResponseMs !== undefined ? bucket.medianResponseMs / 1000 : null })) },
        ]}
      />
      <div className="response-summary-note">
        Only reviews of cards last seen at least a day earlier are scored. The order in which RemNote shows cards can also shape this curve.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface LearningInsightsProps {
  forgettingCurve: ForgettingCurve;
  fatigueCurve: FatigueCurve;
  targetRetention: number;
  accent: string;
}

export function LearningInsights({ forgettingCurve, fatigueCurve, targetRetention, accent }: LearningInsightsProps) {
  return (
    <div className="mb-6 md:mb-10 fade-in">
      <SectionHeader
        title="Learning Insights"
        description="Your personal forgetting curve and when your sessions get too long"
        icon={<span aria-hidden="true" style={{ color: accent }}>💡</span>}
      />
      <div className="space-y-4 md:space-y-6">
        <div className="chart-container">
          <div className="insight-title">Your forgetting curve</div>
          <ForgettingCurveView curve={forgettingCurve} target={targetRetention} accent={accent} />
        </div>
        <div className="chart-container">
          <div className="insight-title">Session fatigue</div>
          <FatigueCurveView curve={fatigueCurve} accent={accent} />
        </div>
      </div>
    </div>
  );
}
