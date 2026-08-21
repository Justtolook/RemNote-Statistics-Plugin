import React from 'react';
import {
    AnalysisRange,
    AvailableDateRange,
    getDateIndex,
    getDateRangeLabel,
    getMonthMarkers,
    updateAnalysisRange,
} from '../lib/dateRange';

interface SectionHeaderProps {
    title: string;
    description: string;
    icon?: React.ReactNode;
}

export function SectionHeader({ title, description, icon }: SectionHeaderProps) {
    return (
        <div className="statistics-section-header">
            {icon && <div className="statistics-section-icon">{icon}</div>}
            <div>
                <h2 className="statistics-section-title">{title}</h2>
                <p className="statistics-section-description">{description}</p>
            </div>
        </div>
    );
}

interface MetricCardProps {
    label: string;
    value: React.ReactNode;
    supporting?: React.ReactNode;
    accent?: string;
    className?: string;
}

export function MetricCard({ label, value, supporting, accent, className = '' }: MetricCardProps) {
    return (
        <div className={`metric-card stat-card ${className}`}>
            <div className="metric-card-label">{label}</div>
            <div className="metric-card-value" style={accent ? { color: accent } : undefined}>{value}</div>
            <div className="metric-card-supporting">{supporting || '\u00a0'}</div>
        </div>
    );
}

interface ChartCardProps {
    children: React.ReactNode;
    className?: string;
}

export function ChartCard({ children, className = '' }: ChartCardProps) {
    return <div className={`chart-card chart-container ${className}`}>{children}</div>;
}

export function SkeletonCard({ className = '' }: { className?: string }) {
    return (
        <div className={`metric-card skeleton-card ${className}`} aria-hidden="true">
            <span className="skeleton-line skeleton-label" />
            <span className="skeleton-line skeleton-value" />
            <span className="skeleton-line skeleton-supporting" />
        </div>
    );
}

export function SkeletonChart({ className = '' }: { className?: string }) {
    return (
        <div className={`chart-card skeleton-chart ${className}`} aria-hidden="true">
            <span className="skeleton-line skeleton-chart-title" />
            <span className="skeleton-chart-body" />
        </div>
    );
}

export function SkeletonRows({ count = 4 }: { count?: number }) {
    return (
        <div className="skeleton-rows" aria-hidden="true">
            {Array.from({ length: count }, (_, index) => <div className="skeleton-row" key={index} />)}
        </div>
    );
}

export function DashboardSkeleton() {
    return (
        <div className="dashboard-skeleton" role="status" aria-live="polite" aria-busy="true" aria-label="Loading review data">
            <div className="statistics-section-header skeleton-section-header">
                <span className="skeleton-line skeleton-icon" />
                <div>
                    <span className="skeleton-line skeleton-section-title" />
                    <span className="skeleton-line skeleton-section-description" />
                </div>
            </div>
            <div className="metric-grid metric-grid-three">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
            </div>
            <SkeletonChart />
            <div className="statistics-section-header skeleton-section-header">
                <span className="skeleton-line skeleton-icon" />
                <div>
                    <span className="skeleton-line skeleton-section-title" />
                    <span className="skeleton-line skeleton-section-description" />
                </div>
            </div>
            <div className="metric-grid">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
            </div>
            <SkeletonChart />
            <SkeletonRows />
        </div>
    );
}

interface EmptyStateProps {
    title: string;
    description: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
    return (
        <div className="statistics-empty-state">
            <div className="statistics-empty-title">{title}</div>
            <div className="statistics-empty-description">{description}</div>
        </div>
    );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
    return (
        <div className="statistics-error-state" role="alert">
            <span>We couldn't load this section.</span>
            <button type="button" onClick={onRetry}>Retry</button>
        </div>
    );
}

interface DateRangeTimelineProps {
    bounds?: AvailableDateRange;
    range?: AnalysisRange;
    onChange: (range: AnalysisRange) => void;
    onCommit: (range: AnalysisRange) => void;
    disabled?: boolean;
}

export function DateRangeTimeline({ bounds, range, onChange, onCommit, disabled = false }: DateRangeTimelineProps) {
    const [activeHandle, setActiveHandle] = React.useState<'start' | 'end'>('end');

    if (!bounds || !range || bounds.days.length === 0) {
        return <div className="timeline-empty">Date range becomes available after review data loads.</div>;
    }

    const max = bounds.days.length - 1;
    const startIndex = getDateIndex(range.start, bounds);
    const endIndex = getDateIndex(range.end, bounds);
    const startPercent = max === 0 ? 0 : (startIndex / max) * 100;
    const endPercent = max === 0 ? 100 : (endIndex / max) * 100;
    const markers = getMonthMarkers(bounds);
    const updateRange = (handle: 'start' | 'end', value: number) => {
        onChange(updateAnalysisRange(range, bounds, handle, value));
    };

    const commitRange = (handle: 'start' | 'end', value: number) => {
        onCommit(updateAnalysisRange(range, bounds, handle, value));
    };

    return (
        <div className="date-timeline" aria-label={`Selected dates: ${getDateRangeLabel(range)}`}>
            <div className="date-timeline-labels">
                <span>Start: <strong>{range.start}</strong></span>
                <span>End: <strong>{range.end}</strong></span>
            </div>
            <div className="date-timeline-track-wrap">
                <div className="date-timeline-track" />
                <div className="date-timeline-selected" style={{ left: `${startPercent}%`, right: `${100 - endPercent}%` }} />
                {markers.map(marker => {
                    const left = max === 0 ? 0 : (marker.index / max) * 100;
                    return (
                        <div className="date-timeline-marker" style={{ left: `${left}%` }} key={marker.date}>
                            <span>{marker.label}</span>
                        </div>
                    );
                })}
                <input
                    className={`date-timeline-input date-timeline-start ${activeHandle === 'start' ? 'date-timeline-active' : ''}`}
                    type="range"
                    min={0}
                    max={max}
                    step={1}
                    value={startIndex}
                    disabled={disabled}
                    aria-label="Start date"
                    aria-valuemin={0}
                    aria-valuemax={max}
                    aria-valuenow={startIndex}
                    aria-valuetext={range.start}
                    onChange={event => updateRange('start', Number(event.target.value))}
                    onPointerDown={() => setActiveHandle('start')}
                    onKeyUp={event => commitRange('start', Number(event.currentTarget.value))}
                    onMouseUp={event => commitRange('start', Number(event.currentTarget.value))}
                    onTouchEnd={event => commitRange('start', Number(event.currentTarget.value))}
                    onBlur={event => commitRange('start', Number(event.currentTarget.value))}
                />
                <input
                    className={`date-timeline-input date-timeline-end ${activeHandle === 'end' ? 'date-timeline-active' : ''}`}
                    type="range"
                    min={0}
                    max={max}
                    step={1}
                    value={endIndex}
                    disabled={disabled}
                    aria-label="End date"
                    aria-valuemin={0}
                    aria-valuemax={max}
                    aria-valuenow={endIndex}
                    aria-valuetext={range.end}
                    onChange={event => updateRange('end', Number(event.target.value))}
                    onPointerDown={() => setActiveHandle('end')}
                    onKeyUp={event => commitRange('end', Number(event.currentTarget.value))}
                    onMouseUp={event => commitRange('end', Number(event.currentTarget.value))}
                    onTouchEnd={event => commitRange('end', Number(event.currentTarget.value))}
                    onBlur={event => commitRange('end', Number(event.currentTarget.value))}
                />
            </div>
            <div className="date-timeline-range-label">{getDateRangeLabel(range)}</div>
        </div>
    );
}
