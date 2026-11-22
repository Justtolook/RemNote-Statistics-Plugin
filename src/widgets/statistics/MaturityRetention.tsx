import React from 'react';
import { MATURE_INTERVAL_DAYS, RetentionBucket, RetentionByMaturity } from '../../lib/dataProcessing';
import { MetricCard } from '../statisticsComponents';

function TargetComparison({ bucket, target }: { bucket: RetentionBucket; target: number }) {
  if (bucket.retentionRate === undefined) return <>No reviews in this period</>;
  const delta = bucket.retentionRate - target;
  const color = delta >= 0 ? '#10b981' : delta >= -5 ? '#f59e0b' : '#ef4444';
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
  return (
    <>
      <span style={{ color, fontWeight: 600 }}>{sign}{Math.abs(delta).toFixed(1)} pts</span>
      {' '}vs. {target}% target · {bucket.total.toLocaleString()} reviews
    </>
  );
}

function formatRate(bucket: RetentionBucket) {
  return bucket.retentionRate === undefined ? 'N/A' : `${bucket.retentionRate.toFixed(1)}%`;
}

interface MaturityRetentionProps {
  maturity: RetentionByMaturity;
  target: number;
  accent: string;
}

/**
 * Retention split into young and mature cards, compared with the user's target.
 */
export function MaturityRetention({ maturity, target, accent }: MaturityRetentionProps) {
  const help = `Interval = days since the card's previous review.\n`
    + `Young: interval 1–${MATURE_INTERVAL_DAYS - 1} days. Mature: ${MATURE_INTERVAL_DAYS}+ days.\n`
    + 'First reviews and repeats on the same day (learning steps) are left out, '
    + 'so these numbers show how well you remember cards between reviews.';

  return (
    <div className="metric-grid metric-grid-three mb-6 md:mb-8">
      <MetricCard
        label={<span className="inline-flex items-center justify-center gap-1">Young Retention <span className="opacity-50 hover:opacity-100 cursor-help" title={help}>ⓘ</span></span>}
        value={formatRate(maturity.young)}
        supporting={<TargetComparison bucket={maturity.young} target={target} />}
        accent={accent}
      />
      <MetricCard
        label={<span className="inline-flex items-center justify-center gap-1">Mature Retention <span className="opacity-50 hover:opacity-100 cursor-help" title={help}>ⓘ</span></span>}
        value={formatRate(maturity.mature)}
        supporting={<TargetComparison bucket={maturity.mature} target={target} />}
        accent="#10b981"
      />
      <MetricCard
        label="Learning Reviews"
        value={maturity.learningReviews.toLocaleString()}
        supporting="First reviews and same-day repeats (not included)"
        accent="var(--rn-clr-content-secondary)"
      />
    </div>
  );
}
