import React from 'react';
import {
    AnalysisRange,
    AvailableDateRange,
    getDateIndex,
    getDateRangeLabel,
    getMonthMarkers,
    getAnalysisRangeCommit,
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
    label: React.ReactNode;
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
    onDraftChange?: (range: AnalysisRange) => void;
    onCommit: (range: AnalysisRange) => void;
    disabled?: boolean;
}

export function DateRangeTimeline({ bounds, range, onDraftChange, onCommit, disabled = false }: DateRangeTimelineProps) {
    const [activeHandle, setActiveHandle] = React.useState<'start' | 'end'>('end');
    const [draftRange, setDraftRange] = React.useState<AnalysisRange | undefined>(range);
    const draftRangeRef = React.useRef<AnalysisRange | undefined>(range);
    const committedRangeRef = React.useRef<AnalysisRange | undefined>(range);
    const pointerInteractionRef = React.useRef(false);
    const keyboardInteractionRef = React.useRef(false);

    React.useEffect(() => {
        draftRangeRef.current = range;
        committedRangeRef.current = range;
        pointerInteractionRef.current = false;
        keyboardInteractionRef.current = false;
        setDraftRange(range);
        if (range) onDraftChange?.(range);
    }, [bounds?.days.length, bounds?.end, bounds?.start, range?.end, range?.start]);

    if (!bounds || !draftRange || bounds.days.length === 0) {
        return <div className="timeline-empty">Date range becomes available after review data loads.</div>;
    }

    const max = bounds.days.length - 1;
    const startIndex = getDateIndex(draftRange.start, bounds);
    const endIndex = getDateIndex(draftRange.end, bounds);
    const startPercent = max === 0 ? 0 : (startIndex / max) * 100;
    const endPercent = max === 0 ? 100 : (endIndex / max) * 100;
    const markers = getMonthMarkers(bounds);
    const updateDraftRange = (handle: 'start' | 'end', value: number) => {
        const currentRange = draftRangeRef.current;
        if (!currentRange) return;

        const nextRange = updateAnalysisRange(currentRange, bounds, handle, value);
        draftRangeRef.current = nextRange;
        setDraftRange(nextRange);
        if (nextRange.start !== currentRange.start || nextRange.end !== currentRange.end) {
            onDraftChange?.(nextRange);
        }
    };

    const commitDraftRange = () => {
        const currentRange = draftRangeRef.current;
        const committedRange = committedRangeRef.current;
        const hasActiveInteraction = pointerInteractionRef.current || keyboardInteractionRef.current;
        if (!currentRange || !committedRange || !hasActiveInteraction) return;

        pointerInteractionRef.current = false;
        keyboardInteractionRef.current = false;
        const nextRange = getAnalysisRangeCommit(committedRange, currentRange);
        if (!nextRange) return;

        committedRangeRef.current = currentRange;
        onCommit(nextRange);
    };

    const cancelInteraction = () => {
        pointerInteractionRef.current = false;
        keyboardInteractionRef.current = false;
        draftRangeRef.current = committedRangeRef.current;
        setDraftRange(committedRangeRef.current);
        if (committedRangeRef.current) onDraftChange?.(committedRangeRef.current);
    };

    const isRangeKeyboardEvent = (event: React.KeyboardEvent<HTMLInputElement>) => {
        return ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key);
    };

    return (
        <div className="date-timeline" aria-label={`Selected dates: ${getDateRangeLabel(draftRange)}`}>
            <div className="date-timeline-track-wrap">
                <div className="date-timeline-track" />
                <div className="date-timeline-selected" style={{ left: `${startPercent}%`, right: `${100 - endPercent}%` }} />
                {markers.map((marker, index) => {
                    const left = max === 0 ? 0 : (marker.index / max) * 100;
                    const markerPosition = marker.index === 0
                        ? 'date-timeline-marker-first'
                        : marker.index === max
                            ? 'date-timeline-marker-last'
                            : 'date-timeline-marker-middle';
                    const markerVisibility = index === 0
                        ? 'date-timeline-marker-label-first'
                        : index === markers.length - 1
                            ? 'date-timeline-marker-label-last'
                            : index % 2 === 1
                                ? 'date-timeline-marker-alternate'
                                : '';
                    return (
                        <div className={`date-timeline-marker ${markerPosition} ${markerVisibility}`} style={{ left: `${left}%` }} key={marker.date}>
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
                    aria-label="Start date"
                    aria-valuemin={0}
                    aria-valuemax={max}
                    aria-valuenow={startIndex}
                    aria-valuetext={draftRange.start}
                    disabled={disabled}
                    onChange={event => updateDraftRange('start', Number(event.target.value))}
                    onFocus={() => setActiveHandle('start')}
                    onPointerDown={event => {
                        setActiveHandle('start');
                        pointerInteractionRef.current = true;
                        event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerUp={() => requestAnimationFrame(commitDraftRange)}
                    onPointerCancel={cancelInteraction}
                    onKeyDown={event => {
                        if (event.key === 'Escape') {
                            event.preventDefault();
                            cancelInteraction();
                            return;
                        }
                        if (isRangeKeyboardEvent(event)) keyboardInteractionRef.current = true;
                    }}
                    onKeyUp={event => {
                        if (isRangeKeyboardEvent(event)) commitDraftRange();
                    }}
                    onBlur={commitDraftRange}
                />
                <input
                    className={`date-timeline-input date-timeline-end ${activeHandle === 'end' ? 'date-timeline-active' : ''}`}
                    type="range"
                    min={0}
                    max={max}
                    step={1}
                    value={endIndex}
                    aria-label="End date"
                    aria-valuemin={0}
                    aria-valuemax={max}
                    aria-valuenow={endIndex}
                    aria-valuetext={draftRange.end}
                    disabled={disabled}
                    onChange={event => updateDraftRange('end', Number(event.target.value))}
                    onFocus={() => setActiveHandle('end')}
                    onPointerDown={event => {
                        setActiveHandle('end');
                        pointerInteractionRef.current = true;
                        event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerUp={() => requestAnimationFrame(commitDraftRange)}
                    onPointerCancel={cancelInteraction}
                    onKeyDown={event => {
                        if (event.key === 'Escape') {
                            event.preventDefault();
                            cancelInteraction();
                            return;
                        }
                        if (isRangeKeyboardEvent(event)) keyboardInteractionRef.current = true;
                    }}
                    onKeyUp={event => {
                        if (isRangeKeyboardEvent(event)) commitDraftRange();
                    }}
                    onBlur={commitDraftRange}
                />
            </div>
        </div>
    );
}
