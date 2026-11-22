import { usePlugin, renderWidget, useTrackerPlugin, useRunAsync } from '@remnote/plugin-sdk';
import React from 'react';
import { getComprehensiveContextRems } from '../lib/utils';
import { getLocaleWeekStart } from '../lib/calendar';
import { getPresetRange, RangeMode } from '../lib/presetRanges';
import {
  AnalysisRange,
  formatLocalDateOnly,
  getAvailableDateRange,
  normalizeAnalysisRange,
} from '../lib/dateRange';
import { getButtonStyle, getBoxStyle, getContainerStyle, getInputStyle, getSafeChartAccent, isHexColor } from '../lib/chartHelpers';
import { STATISTICS_CONTEXT_KEY, StatisticsSessionContext } from '../lib/openStatistics';
import { readNumberSetting, SETTINGS, SETTING_DEFAULTS } from '../lib/settings';
import {
  DashboardSkeleton,
  ChartCard,
  DateRangeTimeline,
  EmptyState,
  ErrorState,
  MetricCard,
  SectionHeader,
} from './statisticsComponents';
import {
  AnalysisContextMode,
  AnalysisScopeMode,
  createAnalysisDataset,
  resolveAnalysisDataset,
} from './statistics/data/analysisDataset';
import { useStatisticsData } from './statistics/useStatisticsData';
import {
  ColumnChart,
  ColumnWithPercentChart,
  CumulativeReviewsChart,
  DueForecastChart,
  HeatmapChart,
  RecallSpeedChart,
  ResponseTimeDistributionChart,
  RetentionByTimeOfDayChart,
  RetentionOverTimeChart,
  TimeSpentChart,
} from './statistics/charts';
import { EasterEggBanners, RememberedMetricCard, useLogoEasterEgg } from './statistics/EasterEggs';
import { HardestCardsSection } from './statistics/HardestCards';
import { MaturityRetention } from './statistics/MaturityRetention';
import { DocumentBreakdown } from './statistics/DocumentBreakdown';
import { SegmentedControl } from './statistics/SegmentedControl';
import { formatTime, interpolateColor } from '../lib/dataProcessing';

const OUTLOOK_OPTIONS = [
  { label: 'Week', value: 7 },
  { label: 'Month', value: 30 },
  { label: 'Year', value: 365 },
];

export const Statistics = () => {
  const plugin = usePlugin();
  const weekStartsOn = React.useMemo(() => getLocaleWeekStart(), []);
  const initial = React.useMemo(() => {
    const range = getPresetRange('This Year', new Date(), weekStartsOn)!;
    return { mode: 'This Year' as RangeMode, start: formatLocalDateOnly(range.start), end: formatLocalDateOnly(range.end) };
  }, [weekStartsOn]);

  // -- State --
  const [contextMode, setContextMode] = React.useState<AnalysisContextMode>('Global');
  const [scopeMode, setScopeMode] = React.useState<AnalysisScopeMode>('descendants');
  const [rangeMode, setRangeMode] = React.useState<RangeMode>(initial.mode);
  const [dateStart, setDateStart] = React.useState<string>(initial.start);
  const [dateEnd, setDateEnd] = React.useState<string>(initial.end);
  const [analysisDateStart, setAnalysisDateStart] = React.useState<string>(initial.start);
  const [analysisDateEnd, setAnalysisDateEnd] = React.useState<string>(initial.end);
  const [isRangeRefreshing, setIsRangeRefreshing] = React.useState(false);
  const [rangeAnnouncement, setRangeAnnouncement] = React.useState('');
  const rangeRefreshTimer = React.useRef<ReturnType<typeof setTimeout>>();
  const [dueOutlook, setDueOutlook] = React.useState<number>(30);
  const [hardestCardsLimit, setHardestCardsLimit] = React.useState<number>(10);
  const [scopeRetry, setScopeRetry] = React.useState(0);
  const { showConfetti, onLogoClick } = useLogoEasterEgg();

  // -- Settings --
  const chartColorSetting = useTrackerPlugin(() => plugin.settings.getSetting<string>(SETTINGS.chartColor));
  const colorLowSetting = useTrackerPlugin(() => plugin.settings.getSetting<string>(SETTINGS.heatmapColorLow));
  const colorHighSetting = useTrackerPlugin(() => plugin.settings.getSetting<string>(SETTINGS.heatmapColorHigh));
  const heatmapTargetSetting = useTrackerPlugin(() => plugin.settings.getSetting<number>(SETTINGS.heatmapTarget));
  const targetRetentionSetting = useTrackerPlugin(() => plugin.settings.getSetting<number>(SETTINGS.targetRetention));
  const maxAnswerSetting = useTrackerPlugin(() => plugin.settings.getSetting<number>(SETTINGS.maxAnswerSeconds));
  const leechThresholdSetting = useTrackerPlugin(() => plugin.settings.getSetting<number>(SETTINGS.leechThreshold));

  const accent = getSafeChartAccent(isHexColor(chartColorSetting) ? chartColorSetting : SETTING_DEFAULTS.chartColor);
  const heatmapColorLow = isHexColor(colorLowSetting) ? colorLowSetting : SETTING_DEFAULTS.heatmapColorLow;
  const heatmapColorHigh = isHexColor(colorHighSetting) ? colorHighSetting : SETTING_DEFAULTS.heatmapColorHigh;
  const heatmapTarget = Math.round(readNumberSetting(heatmapTargetSetting, SETTING_DEFAULTS.heatmapTarget, 1, 100000));
  const heatmapMidPoint = Math.max(1, Math.round(heatmapTarget / 2));
  const heatmapColorMedium = React.useMemo(() => interpolateColor(heatmapColorLow, heatmapColorHigh, 0.5), [heatmapColorLow, heatmapColorHigh]);
  const targetRetention = readNumberSetting(targetRetentionSetting, SETTING_DEFAULTS.targetRetention, 1, 100);
  const maxAnswerSeconds = readNumberSetting(maxAnswerSetting, SETTING_DEFAULTS.maxAnswerSeconds, 0, 86400);
  const maxAnswerMs = maxAnswerSeconds * 1000;
  const leechThreshold = Math.round(readNumberSetting(leechThresholdSetting, SETTING_DEFAULTS.leechThreshold, 1, 1000));

  // -- Data --
  const allGlobalCards = useTrackerPlugin(async (reactivePlugin) => await reactivePlugin.card.getAll());
  const globalDataset = React.useMemo(() => {
    if (allGlobalCards === undefined) return undefined;
    return createAnalysisDataset({ contextMode: 'Global', scopeMode }, allGlobalCards);
  }, [allGlobalCards, scopeMode]);

  const sessionContext = useTrackerPlugin(async (reactivePlugin) => {
    return await reactivePlugin.storage.getSession<StatisticsSessionContext>(STATISTICS_CONTEXT_KEY);
  }, []);
  const contextRemId = sessionContext?.focusedRemId;

  const contextRem = useRunAsync(async () => {
    if (!contextRemId) return undefined;
    return await plugin.rem.findOne(contextRemId);
  }, [contextRemId]);

  const contextRemName = useRunAsync(async () => {
    if (!contextRemId) return 'No Rem Detected';
    if (!contextRem) return 'Loading...';
    if (!contextRem.text) return 'Untitled Rem';
    const text = await plugin.richText.toString(contextRem.text);
    return text && text.trim().length > 0 ? text : 'Untitled Rem';
  }, [contextRem]);

  // The scoped dataset is only loaded while "Current Rem" is selected.
  const currentDatasetResolution = useRunAsync(async () => {
    if (contextMode !== 'Current') return undefined;
    return await resolveAnalysisDataset({ contextMode: 'Current', scopeMode, contextRem }, {
      getAllCards: async () => await plugin.card.getAll(),
      getDescendants: async rem => await rem.getDescendants(),
      getComprehensiveContextRems,
      getCards: async rem => await rem.getCards(),
    });
  }, [contextMode, contextRem, scopeMode, scopeRetry]);

  const scopeError = contextMode === 'Current' ? currentDatasetResolution?.error : undefined;
  const activeDataset = contextMode === 'Global' ? globalDataset : currentDatasetResolution?.dataset;
  const activeCards = activeDataset?.cards;
  const todayDateOnly = formatLocalDateOnly(new Date());
  const availableDateRange = React.useMemo(
    () => getAvailableDateRange(activeCards || [], todayDateOnly),
    [activeCards, todayDateOnly],
  );

  const commitDateRange = React.useCallback((start: string, end: string, mode: RangeMode = 'All') => {
    setDateStart(start);
    setDateEnd(end);
    setAnalysisDateStart(start);
    setAnalysisDateEnd(end);
    setRangeMode(mode);
    setRangeAnnouncement(start && end ? `Selected dates ${start} through ${end}.` : 'Showing all available dates.');
    setIsRangeRefreshing(true);

    if (rangeRefreshTimer.current) clearTimeout(rangeRefreshTimer.current);
    rangeRefreshTimer.current = setTimeout(() => setIsRangeRefreshing(false), 200);
  }, []);

  React.useEffect(() => () => {
    if (rangeRefreshTimer.current) clearTimeout(rangeRefreshTimer.current);
  }, []);

  const handleRangeChange = (mode: RangeMode) => {
    const range = getPresetRange(mode, new Date(), weekStartsOn);
    if (!range) commitDateRange('', '', mode);
    else commitDateRange(formatLocalDateOnly(range.start), formatLocalDateOnly(range.end), mode);
  };

  const isLoadingContext = activeCards === undefined && !(contextMode === 'Current' && !contextRemId);
  const committedAnalysisRange = React.useMemo<AnalysisRange | undefined>(() => {
    if (!analysisDateStart || !analysisDateEnd) return undefined;
    return normalizeAnalysisRange({ start: analysisDateStart, end: analysisDateEnd }, availableDateRange);
  }, [analysisDateStart, analysisDateEnd, availableDateRange]);

  const data = useStatisticsData({
    cards: activeCards,
    range: committedAnalysisRange,
    maxAnswerMs,
    leechThreshold,
    dueOutlookDays: dueOutlook,
    hardestCardsLimit,
  });

  // -- Date controls --
  const dateRangeError = React.useMemo(() => {
    if (!dateStart && !dateEnd) return undefined;
    if (!dateStart || !dateEnd) return 'Enter both a start date and an end date.';
    const normalized = normalizeAnalysisRange({ start: dateStart, end: dateEnd }, availableDateRange);
    if (!normalized) return 'Choose a valid date range where the start is not after the end.';
    if (normalized.start !== dateStart || normalized.end !== dateEnd) {
      return 'Choose dates within the available review history.';
    }
    return undefined;
  }, [availableDateRange, dateEnd, dateStart]);

  const handleExactDateChange = (field: 'start' | 'end', value: string) => {
    const nextStart = field === 'start' ? value : dateStart;
    const nextEnd = field === 'end' ? value : dateEnd;
    if (field === 'start') setDateStart(value);
    if (field === 'end') setDateEnd(value);

    const validRange = normalizeAnalysisRange({ start: nextStart, end: nextEnd }, availableDateRange);
    if (validRange && validRange.start === nextStart && validRange.end === nextEnd) {
      commitDateRange(nextStart, nextEnd, 'All');
    }
  };

  const handleDraftDateRangeChange = React.useCallback((draftRange: AnalysisRange) => {
    setDateStart(draftRange.start);
    setDateEnd(draftRange.end);
    setRangeMode('All');
  }, []);

  const boxStyle = getBoxStyle();
  const inputStyle = getInputStyle();
  const renderPresetBtn = (label: string, mode: RangeMode, extraClass = '') => (
    <button
      type="button"
      onClick={() => handleRangeChange(mode)}
      aria-pressed={rangeMode === mode}
      className={`w-full h-full rounded px-2 py-1 text-xs transition-all hover:opacity-90 flex items-center justify-center ${extraClass}`}
      style={getButtonStyle(rangeMode === mode, accent)}
    >
      {label}
    </button>
  );

  const { totals, buttons, forecast } = data;
  const todayLoad = forecast.days[0] ? forecast.days[0].due + forecast.days[0].overdue : 0;
  const outlookTotal = forecast.days.reduce((sum, day) => sum + day.due + day.overdue, 0);
  const estimate = (cards: number) => data.typicalResponseMs ? formatTime(cards * data.typicalResponseMs) : undefined;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        maxWidth: '100vw',
        maxHeight: '100vh',
        overflow: 'hidden',
        ...getContainerStyle(),
        ['--statistics-accent' as string]: accent,
      }}
      className="statisticsBody"
    >
      {/* Header */}
      <div style={{ flex: '0 0 auto', padding: '1rem', borderBottom: '1px solid var(--rn-clr-border-primary)' }} className="md:px-6">
        <EasterEggBanners showConfetti={showConfetti} accent={accent} />

        <div className="flex items-center justify-between gap-2 md:gap-3">
          <div className="flex items-center gap-2 md:gap-3">
            <div onClick={onLogoClick} className="cursor-pointer transition-transform hover:scale-110" title="Click me multiple times... 👀">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 md:w-7 md:h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: accent }}>
                <line x1="18" y1="20" x2="18" y2="10"></line>
                <line x1="12" y1="20" x2="12" y2="4"></line>
                <line x1="6" y1="20" x2="6" y2="14"></line>
              </svg>
            </div>
            <div>
              <div className="font-bold text-lg md:text-2xl" style={{ color: 'var(--rn-clr-content-primary)' }}>Statistics Dashboard</div>
              <div className="text-xs md:text-sm opacity-60 hidden sm:block">Comprehensive flashcard analytics and review insights</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => plugin.widget.closePopup()}
            className="flex items-center justify-center p-2 rounded-lg transition-all hover:opacity-80"
            style={{ backgroundColor: 'var(--rn-clr-background-secondary)', border: '1px solid var(--rn-clr-border-primary)', cursor: 'pointer' }}
            title="Close Statistics"
            aria-label="Close Statistics"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="custom-scroll" style={{ flex: '1 1 0', height: '100vh', overflowY: 'auto', overflowX: 'hidden', padding: '1rem', minHeight: 300 }}>
        {/* --- CONTROLS --- */}
        <div className="mb-8 p-6 border rounded-lg shadow-sm fade-in" style={{ ...boxStyle, borderRadius: '12px' }}>
          <div className="flex flex-col md:flex-row gap-6">
            {/* Context */}
            <div className="flex-1 lg:border-r lg:pr-6 flex flex-col pb-4 lg:pb-0 border-b lg:border-b-0" style={{ borderColor: 'var(--rn-clr-border-primary)' }}>
              <div className="flex items-center gap-2 mb-2 md:mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                </svg>
                <h4 className="font-bold text-xs md:text-sm uppercase tracking-wide opacity-70">Context</h4>
              </div>
              <div className="flex flex-col gap-1.5 md:gap-2">
                <label className="flex items-center space-x-2 cursor-pointer text-sm md:text-base">
                  <input type="radio" checked={contextMode === 'Global'} onChange={() => setContextMode('Global')} className="form-radio w-4 h-4" style={{ accentColor: accent }} />
                  <span>Global</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer text-sm md:text-base">
                  <input type="radio" checked={contextMode === 'Current'} onChange={() => setContextMode('Current')} className="form-radio w-4 h-4" style={{ accentColor: accent }} />
                  <span className="truncate" title={contextMode === 'Current' ? contextRemName : 'Current Rem'}>
                    {contextMode === 'Current' ? contextRemName : 'Current Rem'}
                  </span>
                </label>
              </div>

              {contextMode === 'Current' && (
                <div className="mt-2 pl-6 flex flex-col gap-1">
                  <div className="text-xs opacity-50 uppercase tracking-wide mb-1">Scope</div>
                  <label className="flex items-center space-x-2 cursor-pointer text-xs">
                    <input type="radio" checked={scopeMode === 'descendants'} onChange={() => setScopeMode('descendants')} className="form-radio h-3 w-3" style={{ accentColor: accent }} />
                    <span>Descendants Only</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer text-xs">
                    <input type="radio" checked={scopeMode === 'comprehensive'} onChange={() => setScopeMode('comprehensive')} className="form-radio h-3 w-3" style={{ accentColor: accent }} />
                    <span>Comprehensive</span>
                    <span
                      className="opacity-50 hover:opacity-100 cursor-help transition-opacity"
                      title="Descendants, Rems that reference or are tagged with this rem and its descendants, Sources, Portals and Table Views"
                    >ⓘ</span>
                  </label>
                </div>
              )}

              <div className="mt-3 lg:mt-auto pt-3 lg:pt-4">
                <div className="p-2 md:p-3 rounded-lg" style={{ backgroundColor: 'var(--rn-clr-background-tertiary)' }}>
                  <div className="text-xs opacity-70 uppercase tracking-wide mb-1">Total Flashcards</div>
                  <div className="text-xl md:text-2xl font-bold" style={{ color: accent }}>
                    {activeCards ? activeCards.length.toLocaleString() : '-'}
                  </div>
                </div>
              </div>
            </div>

            {/* Period */}
            <div className="flex-[3] flex flex-col gap-2 md:gap-3">
              <div>
                <div className="flex items-center gap-2 mb-2 md:mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                  <h4 className="font-bold text-xs md:text-sm uppercase tracking-wide opacity-70">Period</h4>
                </div>

                <div className="grid gap-1 md:gap-1.5 grid-cols-3 sm:grid-cols-5">
                  <div style={{ gridColumn: '1', gridRow: '1 / 3' }}>{renderPresetBtn('Today', 'Today')}</div>
                  <div style={{ gridColumn: '1', gridRow: '3' }}>{renderPresetBtn('Yesterday', 'Yesterday')}</div>

                  <div style={{ gridColumn: '2', gridRow: '1' }}>{renderPresetBtn('Week', 'Week')}</div>
                  <div style={{ gridColumn: '2', gridRow: '2' }}>{renderPresetBtn('This Week', 'This Week')}</div>
                  <div style={{ gridColumn: '2', gridRow: '3' }}>{renderPresetBtn('Last Week', 'Last Week')}</div>

                  <div style={{ gridColumn: '3', gridRow: '1' }}>{renderPresetBtn('Month', 'Month')}</div>
                  <div style={{ gridColumn: '3', gridRow: '2' }}>{renderPresetBtn('This Month', 'This Month')}</div>
                  <div style={{ gridColumn: '3', gridRow: '3' }}>{renderPresetBtn('Last Month', 'Last Month')}</div>

                  <div style={{ gridColumn: '4', gridRow: '1' }}>{renderPresetBtn('Year', 'Year')}</div>
                  <div style={{ gridColumn: '4', gridRow: '2' }}>{renderPresetBtn('This Year', 'This Year')}</div>
                  <div style={{ gridColumn: '4', gridRow: '3' }}>{renderPresetBtn('Last Year', 'Last Year')}</div>

                  <div style={{ gridColumn: '5', gridRow: '1 / 4' }}>{renderPresetBtn('All', 'All', 'font-bold')}</div>
                </div>
              </div>

              <div className="mt-2">
                <DateRangeTimeline
                  bounds={availableDateRange}
                  range={committedAnalysisRange || availableDateRange}
                  onDraftChange={handleDraftDateRangeChange}
                  onCommit={(nextRange) => commitDateRange(nextRange.start, nextRange.end, 'All')}
                  disabled={!availableDateRange}
                />
              </div>

              <div className="flex flex-wrap gap-2 md:gap-4 items-end mt-2">
                <div className="flex flex-col flex-1 min-w-[120px]">
                  <label htmlFor="statistics-start-date" className="text-xs opacity-70 mb-1">Start Date</label>
                  <input
                    id="statistics-start-date"
                    type="date"
                    value={dateStart}
                    aria-invalid={Boolean(dateRangeError)}
                    aria-describedby={dateRangeError ? 'statistics-date-error' : undefined}
                    onChange={(e) => handleExactDateChange('start', e.target.value)}
                    className="border rounded px-2 py-1 text-sm w-full"
                    style={inputStyle}
                  />
                </div>
                <div className="flex flex-col flex-1 min-w-[120px]">
                  <label htmlFor="statistics-end-date" className="text-xs opacity-70 mb-1">End Date</label>
                  <input
                    id="statistics-end-date"
                    type="date"
                    value={dateEnd}
                    aria-invalid={Boolean(dateRangeError)}
                    aria-describedby={dateRangeError ? 'statistics-date-error' : undefined}
                    onChange={(e) => handleExactDateChange('end', e.target.value)}
                    className="border rounded px-2 py-1 text-sm w-full"
                    style={inputStyle}
                  />
                </div>
                {(dateStart || dateEnd) && (
                  <button type="button" onClick={() => handleRangeChange('All')} className="text-xs hover:underline mb-2 ml-auto" style={{ color: accent }}>
                    Clear Filter
                  </button>
                )}
                {dateRangeError && <div id="statistics-date-error" className="w-full text-xs" style={{ color: '#ef4444' }}>{dateRangeError}</div>}
              </div>
            </div>
          </div>
        </div>

        <div className="sr-only" aria-live="polite">{rangeAnnouncement}</div>

        {/* --- CONTENT --- */}
        {isLoadingContext || isRangeRefreshing ? (
          <DashboardSkeleton />
        ) : scopeError ? (
          <ErrorState onRetry={() => setScopeRetry(value => value + 1)} />
        ) : !activeCards || activeCards.length === 0 ? (
          <EmptyState
            title="No flashcards found"
            description={contextMode === 'Global'
              ? 'Start creating flashcards to see your statistics here.'
              : 'No flashcards found in the selected context. Try switching to Global mode or selecting a different Rem.'}
          />
        ) : (
          <>
            {totals.reviews === 0 && (
              <div className="mb-6">
                <EmptyState
                  title="No reviews in this period"
                  description="The selected scope has cards, but no review activity in this date range. Try widening the range to see historical activity."
                />
              </div>
            )}

            {/* SECTION 1: STUDY OVERVIEW */}
            <div className="mb-6 md:mb-10 fade-in">
              <SectionHeader title="Study Overview" description="Daily review activity and learning consistency" icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 md:w-6 md:h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: accent }}>
                  <rect x="3" y="3" width="7" height="7"></rect>
                  <rect x="14" y="3" width="7" height="7"></rect>
                  <rect x="14" y="14" width="7" height="7"></rect>
                  <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
              } />
              <ChartCard>
                <HeatmapChart
                  data={data.heatmap.data}
                  colorLow={heatmapColorLow}
                  colorMedium={heatmapColorMedium}
                  colorHigh={heatmapColorHigh}
                  midPoint={heatmapMidPoint}
                  target={heatmapTarget}
                />
              </ChartCard>

              <div className="metric-grid metric-grid-three mt-6">
                <MetricCard label="Days Learned" value={data.heatmap.daysLearned} supporting="Days with at least one review" accent={accent} />
                <MetricCard label="Daily Average" value={data.heatmap.dailyAverage} supporting="Reviews per calendar day" accent={accent} />
                <MetricCard label="Longest Streak" value={`${data.heatmap.longestStreak} days`} supporting="Consecutive review days" accent={accent} />
              </div>
            </div>

            <div className="section-divider"></div>

            {/* SECTION 2: REVIEW PERFORMANCE */}
            <div className="mb-6 md:mb-10 fade-in">
              <SectionHeader title="Review Performance" description="Retention, review volume, outcomes, and total time" icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 md:w-6 md:h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: accent }}>
                  <path d="M3 3v18h18"></path>
                  <path d="M18 17V9"></path>
                  <path d="M13 17V5"></path>
                  <path d="M8 17v-3"></path>
                </svg>
              } />

              <div className="metric-grid metric-grid-five mb-6 md:mb-8">
                <MetricCard
                  label={<span className="inline-flex items-center justify-center gap-1">Retention Rate <span className="opacity-50 hover:opacity-100 cursor-help transition-opacity" title={'The percentage of reviews where you successfully recalled the answer.\nCalculation: (Hard + Good + Easy) / (Forgot + Hard + Good + Easy)'} aria-label="Retention rate calculation help">ⓘ</span></span>}
                  value={totals.retention === undefined ? 'N/A' : `${(totals.retention * 100).toFixed(1)}%`}
                  supporting={totals.retention === 1 ? <span className="font-semibold" style={{ color: '#10b981' }}>🏆 Perfect! You're unstoppable! 🏆</span> : undefined}
                  accent={accent}
                />
                <MetricCard
                  label="Total Reviews"
                  value={totals.reviews.toLocaleString()}
                  supporting={buttons.counts.Skip > 0 ? `${buttons.counts.Skip.toLocaleString()} skips not counted` : undefined}
                  accent={accent}
                />
                <MetricCard label="Forgot" value={totals.forgot.toLocaleString()} accent="#ef4444" />
                <RememberedMetricCard value={totals.remembered} />
                <MetricCard
                  label={<span className="inline-flex items-center justify-center gap-1">Time Spent <span className="opacity-50 hover:opacity-100 cursor-help transition-opacity" title="Total time spent reviewing flashcards in the selected time period" aria-label="Time spent help">ⓘ</span></span>}
                  value={formatTime(data.time.summary.totalTimeMs)}
                  supporting={data.time.summary.totalTimeMs > 0 ? `${formatTime(data.time.summary.averageTimePerReviewDay)}/day studied` : undefined}
                  accent="#f59e0b"
                />
              </div>

              <MaturityRetention maturity={data.maturity} target={targetRetention} accent={accent} />

              <div className="section-divider section-divider-subsection"></div>
              <SectionHeader title="Review Behavior" description="Button choices, repetition patterns, and retention trends" icon={<span aria-hidden="true">↗</span>} />

              <div className="space-y-4 md:space-y-6">
                <div className="chart-container">
                  <ColumnWithPercentChart data={buttons.chartData} title="Buttons pressed" total={buttons.total} accent={accent} />
                </div>
                <div className="chart-container">
                  <ColumnChart data={data.cardsByReviews} title="Number of cards grouped by number of reviews" accent={accent} />
                </div>
                <div className="chart-container">
                  <CumulativeReviewsChart series={data.cumulativeReviews} accent={accent} />
                </div>
                <div className="chart-container">
                  <RetentionOverTimeChart
                    daily={data.retention.daily}
                    weekly={data.retention.weekly}
                    monthly={data.retention.monthly}
                    cumulative={data.retention.cumulative}
                    target={targetRetention}
                    accent={accent}
                  />
                </div>
                <div className="chart-container">
                  <RetentionByTimeOfDayChart data={data.timeOfDay} accent={accent} />
                </div>

                <div className="section-divider section-divider-subsection"></div>
                <SectionHeader title="Speed and Efficiency" description="Time spent, recall speed, and response-time distribution" icon={<span aria-hidden="true">◷</span>} />

                <div className="chart-container">
                  <TimeSpentChart data={data.time.daily} summary={data.time.summary} maxAnswerSeconds={maxAnswerSeconds} accent={accent} />
                </div>
                <div className="chart-container">
                  <RecallSpeedChart
                    daily={data.time.recallSpeed}
                    movingAverage={data.time.recallSpeedMovingAverage}
                    summary={data.time.recallSpeedSummary}
                    accent={accent}
                  />
                </div>
                <div className="chart-container">
                  <ResponseTimeDistributionChart distribution={data.time.distribution} accent={accent} />
                </div>
              </div>
            </div>

            <div className="section-divider"></div>

            {/* SECTION 3: PLAN AHEAD */}
            <div className="mb-6 md:mb-8 fade-in">
              <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 md:gap-4 mb-4 md:mb-6">
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="p-1.5 md:p-2 rounded-lg" style={{ backgroundColor: 'var(--rn-clr-background-secondary)' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 md:w-6 md:h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: accent }}>
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                  </div>
                  <div>
                    <div className="font-bold text-lg md:text-xl">Plan Ahead</div>
                    <div className="text-xs md:text-sm opacity-60 hidden sm:block">Backlog and upcoming workload</div>
                  </div>
                </div>
                <SegmentedControl options={OUTLOOK_OPTIONS} value={dueOutlook} onChange={setDueOutlook} accent={accent} />
              </div>

              <div className="metric-grid metric-grid-three mb-4 md:mb-6">
                <MetricCard
                  label="Overdue Now"
                  value={forecast.overdueCount.toLocaleString()}
                  supporting={forecast.overdueCount > 0 ? `≈ ${estimate(forecast.overdueCount) ?? '–'} to clear` : 'Nothing overdue 🎉'}
                  accent={forecast.overdueCount > 0 ? '#ef4444' : '#10b981'}
                />
                <MetricCard
                  label="Due Today"
                  value={todayLoad.toLocaleString()}
                  supporting={estimate(todayLoad) ? `≈ ${estimate(todayLoad)} incl. backlog` : 'Including backlog'}
                  accent={accent}
                />
                <MetricCard
                  label={`Next ${dueOutlook} Days`}
                  value={outlookTotal.toLocaleString()}
                  supporting={data.typicalResponseMs
                    ? `≈ ${estimate(outlookTotal)} at ${formatTime(data.typicalResponseMs, 'seconds')}/card`
                    : 'No timing data for an estimate yet'}
                  accent={accent}
                />
              </div>

              <div className="chart-container">
                <DueForecastChart forecast={forecast} typicalResponseMs={data.typicalResponseMs} accent={accent} />
              </div>
              <div className="response-summary-note">
                Time estimates use your median answer time over the last 30 days.
              </div>
            </div>

            <div className="section-divider"></div>

            {/* SECTION 4: CARDS TO IMPROVE */}
            <HardestCardsSection
              plugin={plugin}
              cards={data.hardestCards}
              limit={hardestCardsLimit}
              onLimitChange={setHardestCardsLimit}
              leechThreshold={leechThreshold}
            />

            <div className="section-divider"></div>

            {/* SECTION 5: BREAKDOWN */}
            <DocumentBreakdown
              plugin={plugin}
              cards={activeCards}
              contextRemId={contextMode === 'Current' ? contextRemId : undefined}
              start={data.start}
              end={data.end}
              leechThreshold={leechThreshold}
              maxAnswerMs={maxAnswerMs}
              accent={accent}
            />
          </>
        )}
      </div>
    </div>
  );
};

renderWidget(Statistics);
