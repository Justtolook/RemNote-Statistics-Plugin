import { usePlugin, renderWidget, useTrackerPlugin, Card, useRunAsync } from '@remnote/plugin-sdk';
import Chart from 'react-apexcharts';
import React from 'react';
import { getComprehensiveContextRems } from '../lib/utils';
import {
  AnalysisRange,
  filterCardsByRange,
  formatLocalDateOnly,
  getAvailableDateRange,
  normalizeAnalysisRange,
} from '../lib/dateRange';
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
  setChartColor,
  chartColor,
  getCommonChartOptions,
  getContainerStyle,
  getBoxStyle,
  getInputStyle,
  getButtonStyle,
  transformObjectToCategoryFormat,
  retentionRate
} from '../lib/chartHelpers';
import {
  getFutureDueCards,
  getAnalysisTimestamps,
  getNumberRepetitionsGroupedByScore,
  getNumberCardsGroupedByRepetitions,
  getRepetitionsPerDayObject,
  getRepetitionsPerDayOptimized,
  categorizeDataByWeekday,
  getLongestStreak,
  getDailyAverage,
  interpolateColor,
  getRetentionRateOverTime,
  getMovingAverageSeries,
  getCumulativeAverageSeries,
  getHardestCards,
  HardCardData,
  getRetentionRateByTimeOfDay,
  TimeOfDayRetention,
  getTimeSpentPerDay,
  calculateTimeStatsSummary,
  formatTime,
  DailyTimeStats,
  TimeStatsSummary,
  getRecallSpeedPerDay,
  getWeightedRecallSpeedMovingAverage,
  calculateRecallSpeedSummary,
  RecallSpeedDataPoint,
  RecallSpeedSummary,
  getResponseTimeDistribution,
  ResponseTimeDistribution
} from '../lib/dataProcessing';
import {
  createAnalysisDataset,
  resolveAnalysisDataset,
} from './statistics/data/analysisDataset';

type RangeMode = 'Today' | 'Yesterday' | 'Week' | 'This Week' | 'Last Week' | 'Month' | 'This Month' | 'Last Month' | 'Year' | 'This Year' | 'Last Year' | 'All';

const DEFAULT_heatmapColorLow = '#b3dff0';
const DEFAULT_heatmapColorHigh = '#1302d1';

export const Statistics = () => {
  const plugin = usePlugin();
  
  // Initialize with 'This Year' by default
  const getInitialState = () => {
    const t = new Date();
    const start = new Date(t.getFullYear(), 0, 1);
    const end = t;
    return {
      mode: 'This Year' as RangeMode,
      start: formatLocalDateOnly(start),
      end: formatLocalDateOnly(end)
    };
  };

  const initial = React.useMemo(() => getInitialState(), []);

  // -- State Management --
  const [contextMode, setContextMode] = React.useState<'Global' | 'Current'>('Global');
  const [scopeMode, setScopeMode] = React.useState<'descendants' | 'comprehensive'>('descendants');
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
  
  // -- Easter Eggs --
  const [konamiCode, setKonamiCode] = React.useState<string[]>([]);
  const [showEasterEgg, setShowEasterEgg] = React.useState(false);
  const [logoClickCount, setLogoClickCount] = React.useState(0);
  const [showConfetti, setShowConfetti] = React.useState(false);
  const [showEasterBunny, setShowEasterBunny] = React.useState(false);
  const [scopeError, setScopeError] = React.useState<string>();
  const [scopeRetry, setScopeRetry] = React.useState(0);

  // -- Settings --
  const chartColorSettings = useTrackerPlugin(() => plugin.settings.getSetting('statistics-chart-color'));
  const colorLowSetting = useTrackerPlugin(() => plugin.settings.getSetting('HeatmapColorLow'));
  const colorHighSetting = useTrackerPlugin(() => plugin.settings.getSetting('HeatmapColorHigh'));
  const lowerBoundSetting = useTrackerPlugin(() => plugin.settings.getSetting('HeatmapTarget'));

  React.useEffect(() => {
    if (chartColorSettings && typeof chartColorSettings === 'string' && /^#[0-9A-F]{6}$/i.test(chartColorSettings)) {
      setChartColor(chartColorSettings);
    }
  }, [chartColorSettings]);

  const heatmapColorLow = (colorLowSetting && /^#[0-9A-F]{6}$/i.test(colorLowSetting as string)) 
    ? colorLowSetting as string 
    : DEFAULT_heatmapColorLow;

  const heatmapColorHigh = (colorHighSetting && /^#[0-9A-F]{6}$/i.test(colorHighSetting as string)) 
    ? colorHighSetting as string 
    : DEFAULT_heatmapColorHigh;
    
  const heatmapTarget = (lowerBoundSetting !== undefined && lowerBoundSetting !== null)
    ? Number(lowerBoundSetting) 
    : 30;

  const heatmapMidPoint = Math.max(1, Math.round(heatmapTarget / 2));
  const heatmapColorMedium = React.useMemo(() => {
    return interpolateColor(heatmapColorLow, heatmapColorHigh, 0.5);
  }, [heatmapColorLow, heatmapColorHigh]);

  // -- Easter Egg: Konami Code --
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      const konamiSequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
      
      setKonamiCode(prev => {
        const newCode = [...prev, key].slice(-10);
        if (newCode.join(',') === konamiSequence.join(',')) {
          setShowEasterEgg(true);
          setTimeout(() => setShowEasterEgg(false), 5000);
          return [];
        }
        return newCode;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // -- Easter Egg: Logo Click Counter --
  React.useEffect(() => {
    if (logoClickCount >= 7) {
      setShowConfetti(true);
      setTimeout(() => {
        setShowConfetti(false);
        setLogoClickCount(0);
      }, 3000);
    }
  }, [logoClickCount]);

  // -- Global Data --
  const allGlobalCards = useTrackerPlugin(async (reactivePlugin) => await reactivePlugin.card.getAll());
  const globalDataset = React.useMemo(() => {
    if (allGlobalCards === undefined) return undefined;
    return createAnalysisDataset({ contextMode: 'Global', scopeMode }, allGlobalCards);
  }, [allGlobalCards, scopeMode]);

  // -- Context Fetching --
  const sessionContext = useTrackerPlugin(async (reactivePlugin) => {
    return await reactivePlugin.storage.getSession<{focusedRemId: string}>('statistics-context');
  }, []);
  const contextRemId = sessionContext?.focusedRemId;

  const contextRem = useRunAsync(async () => {
    if (!contextRemId) return undefined;
    return await plugin.rem.findOne(contextRemId);
  }, [contextRemId]);

  const contextRemName = useRunAsync(async () => {
     if(!contextRemId) return "No Rem Detected";
     if(!contextRem) return "Loading...";
     if (!contextRem.text) return "Untitled Rem";
     const text = await plugin.richText.toString(contextRem.text);
     return text && text.trim().length > 0 ? text : "Untitled Rem";
  }, [contextRem]);
  
  // -- Context Data Fetch --
  const currentDatasetResolution = useRunAsync(async () => {
    return await resolveAnalysisDataset({
      contextMode: 'Current',
      scopeMode,
      contextRem,
    }, {
      getAllCards: async () => await plugin.card.getAll(),
      getDescendants: async rem => await rem.getDescendants(),
      getComprehensiveContextRems,
      getCards: async rem => await rem.getCards(),
    });
  }, [contextRem, scopeMode, scopeRetry]);

  React.useEffect(() => {
    setScopeError(contextMode === 'Current' ? currentDatasetResolution?.error : undefined);
  }, [contextMode, contextRemId, scopeMode, currentDatasetResolution]);

  const activeDataset = contextMode === 'Global' ? globalDataset : currentDatasetResolution?.dataset;
  const activeCardsSource = activeDataset?.cards;
  const todayDateOnly = formatLocalDateOnly(new Date());
  const availableDateRange = React.useMemo(() => {
    return getAvailableDateRange((activeCardsSource || []) as Array<{ repetitionHistory?: Array<{ date: number }> | null }>, todayDateOnly);
  }, [activeCardsSource, todayDateOnly]);

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

  React.useEffect(() => {
    return () => {
      if (rangeRefreshTimer.current) clearTimeout(rangeRefreshTimer.current);
    };
  }, []);

  // -- Range Change Handler --
  const handleRangeChange = (mode: RangeMode) => {
    const t = new Date();
    const getToday = () => new Date(t);

    let start = getToday();
    let end = getToday();

    switch (mode) {
      case 'Today':
        break;
      case 'Yesterday':
        start.setDate(t.getDate() - 1);
        end.setDate(t.getDate() - 1);
        break;
      case 'Week':
        start.setDate(t.getDate() - 7);
        break;
      case 'This Week':
        start.setDate(t.getDate() - t.getDay());
        break;
      case 'Last Week':
        end.setDate(t.getDate() - t.getDay() - 1);
        start = new Date(end);
        start.setDate(end.getDate() - 6);
        break;
      case 'Month':
        start.setDate(t.getDate() - 30);
        break;
      case 'This Month':
        start = new Date(t.getFullYear(), t.getMonth(), 1);
        break;
      case 'Last Month':
        start = new Date(t.getFullYear(), t.getMonth() - 1, 1);
        end = new Date(t.getFullYear(), t.getMonth(), 0);
        break;
      case 'Year':
        start.setDate(t.getDate() - 365);
        break;
      case 'This Year':
        start = new Date(t.getFullYear(), 0, 1);
        break;
      case 'Last Year':
        start = new Date(t.getFullYear() - 1, 0, 1);
        end = new Date(t.getFullYear() - 1, 11, 31);
        break;
      case 'All':
        commitDateRange('', '', mode);
        return;
    }

    commitDateRange(formatLocalDateOnly(start), formatLocalDateOnly(end), mode);
  };
  
  const isLoadingContext = activeCardsSource === undefined && !(contextMode === 'Current' && !contextRemId);
  const committedAnalysisRange = React.useMemo<AnalysisRange | undefined>(() => {
    if (!analysisDateStart || !analysisDateEnd) return undefined;
    return normalizeAnalysisRange(
      { start: analysisDateStart, end: analysisDateEnd },
      availableDateRange
    );
  }, [analysisDateStart, analysisDateEnd, availableDateRange]);

  // -- Filtered Data for History Charts --
  const filteredCards = React.useMemo(() => {
    if (!activeCardsSource) return [];
    return filterCardsByRange(activeCardsSource as Array<Card & { repetitionHistory?: Array<{ date: number }> | null }>, committedAnalysisRange) as Card[];
  }, [activeCardsSource, committedAnalysisRange]);

  const selectedReviewCount = React.useMemo(() => {
    return filteredCards.reduce((total, card) => total + (card.repetitionHistory?.length || 0), 0);
  }, [filteredCards]);

  // -- Filtered Data for Heatmap --
  const heatmapData = React.useMemo(() => {
    if (!activeCardsSource) return [];
    const { start: startTs, end: endTs } = getAnalysisTimestamps(committedAnalysisRange);
    return getRepetitionsPerDayOptimized(activeCardsSource, startTs, endTs);
  }, [activeCardsSource, committedAnalysisRange]);

  // -- Prepared Data --
  const buttonsPressedDataObj = getNumberRepetitionsGroupedByScore(filteredCards);
  const buttonsPressedTotal = Object.values(buttonsPressedDataObj).reduce((a:any, b:any) => a + b, 0) as number;
  const buttonsPressedData = transformObjectToCategoryFormat(buttonsPressedDataObj);

  const retentionRateOverTimeData = React.useMemo(() => {
    return getRetentionRateOverTime(filteredCards);
  }, [filteredCards]);

  const retentionRateWeeklyMA = React.useMemo(() => {
    return getMovingAverageSeries(retentionRateOverTimeData, 7);
  }, [retentionRateOverTimeData]);

  const retentionRateMonthlyMA = React.useMemo(() => {
    return getMovingAverageSeries(retentionRateOverTimeData, 30);
  }, [retentionRateOverTimeData]);

  const retentionRateCumulativeAvg = React.useMemo(() => {
    return getCumulativeAverageSeries(retentionRateOverTimeData);
  }, [retentionRateOverTimeData]);

  const dueCardsDataRaw = getFutureDueCards(activeCardsSource, dueOutlook);
  const dueCardsTotal = dueCardsDataRaw.reduce((sum, item) => sum + item[1], 0);
  
  let runningTotal = 0;
  const dueCardsCumulative = dueCardsDataRaw.map(item => {
    runningTotal += item[1];
    return runningTotal;
  });

  // Heatmap stats
  const daysLearned = heatmapData.filter(d => d.y > 0).length;
  const dailyAverage = getDailyAverage(heatmapData);
  const longestStreak = getLongestStreak(heatmapData);

  // Hardest cards data
  const hardestCardsData = React.useMemo(() => {
    return getHardestCards(filteredCards, hardestCardsLimit, 3);
  }, [filteredCards, hardestCardsLimit]);

  // Time of day retention data
  const timeOfDayRetentionData = React.useMemo(() => {
    return getRetentionRateByTimeOfDay(filteredCards);
  }, [filteredCards]);

  // Time statistics data
  const timeStatsData = React.useMemo(() => {
    const { start: startTs, end: endTs } = getAnalysisTimestamps(committedAnalysisRange);
    return getTimeSpentPerDay(activeCardsSource, startTs, endTs);
  }, [activeCardsSource, committedAnalysisRange]);

  const timeStatsSummary = React.useMemo(() => {
    const analysisTimestamps = committedAnalysisRange ? getAnalysisTimestamps(committedAnalysisRange) : undefined;
    const startTs = analysisTimestamps?.start;
    const endTs = analysisTimestamps?.end;
    return calculateTimeStatsSummary(timeStatsData, startTs, endTs);
  }, [timeStatsData, committedAnalysisRange]);

  const recallSpeedData = React.useMemo(() => {
    return getRecallSpeedPerDay(timeStatsData);
  }, [timeStatsData]);

  const recallSpeedMovingAverage = React.useMemo(() => {
    return getWeightedRecallSpeedMovingAverage(recallSpeedData, 7);
  }, [recallSpeedData]);

  const recallSpeedSummary = React.useMemo(() => {
    return calculateRecallSpeedSummary(recallSpeedData, 7);
  }, [recallSpeedData]);

  const responseTimeDistribution = React.useMemo(() => {
    return getResponseTimeDistribution(timeStatsData);
  }, [timeStatsData]);

  // -- Styles --
  const containerStyle = getContainerStyle();
  const boxStyle = getBoxStyle();
  const inputStyle = getInputStyle();

  const getBtnStyle = (mode: RangeMode) => {
    const isSelected = rangeMode === mode;
    return getButtonStyle(isSelected, chartColor);
  };

  const renderPresetBtn = (label: string, mode: RangeMode) => (
    <button
      onClick={() => handleRangeChange(mode)}
      className="w-full h-full rounded px-2 py-1 text-xs transition-all hover:opacity-90 flex items-center justify-center"
      style={getBtnStyle(mode)}
    >
      {label}
    </button>
  );

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

    const validRange = normalizeAnalysisRange(
      { start: nextStart, end: nextEnd },
      availableDateRange
    );
    if (validRange && validRange.start === nextStart && validRange.end === nextEnd) {
      commitDateRange(nextStart, nextEnd, 'All');
    }
  };

  const handleDraftDateRangeChange = React.useCallback((draftRange: AnalysisRange) => {
    setDateStart(draftRange.start);
    setDateEnd(draftRange.end);
    setRangeMode('All');
  }, []);

  

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
        ...containerStyle,
        ['--statistics-accent' as string]: chartColor,
      }} 
      className="statisticsBody"
    >
      {/* Header - Fixed */}
      <div style={{ flex: '0 0 auto', padding: '1rem', borderBottom: '1px solid var(--rn-clr-border-primary)' }} className="md:px-6">
        {/* Easter Egg: Konami Code Message */}
        {showEasterEgg && (
          <div 
            className="mb-4 p-4 rounded-lg text-center animate-bounce"
            style={{ 
              backgroundColor: chartColor,
              color: '#fff',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }}
          >
            <div className="text-lg font-bold">🎉 Konami Code Activated! 🎉</div>
            <div className="text-sm mt-1">You're a true legend! Keep crushing those flashcards! 💪</div>
          </div>
        )}
        
        {/* Easter Egg: Confetti Effect */}
        {showConfetti && (
          <div 
            className="mb-4 p-6 rounded-lg text-center"
            style={{ 
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: '#fff',
              boxShadow: '0 8px 20px rgba(0,0,0,0.2)',
              animation: 'pulse 0.5s ease-in-out infinite'
            }}
          >
            <div className="text-3xl mb-2">🎊 🎉 🎈 ✨ 🎁 🌟</div>
            <div className="text-xl font-bold">Congratulations!</div>
            <div className="text-sm mt-2">You found the secret click counter! 🎯</div>
            <div className="text-xs mt-1 opacity-90">You're clearly very curious... or very bored 😄</div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 md:gap-3">
          <div className="flex items-center gap-2 md:gap-3">
            <div 
              onClick={() => setLogoClickCount(prev => prev + 1)}
              className="cursor-pointer transition-transform hover:scale-110"
              title="Click me multiple times... 👀"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 md:w-7 md:h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: chartColor }}>
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
            onClick={() => plugin.widget.closePopup()}
            className="flex items-center justify-center p-2 rounded-lg transition-all hover:opacity-80"
            style={{ 
              backgroundColor: 'var(--rn-clr-background-secondary)',
              border: '1px solid var(--rn-clr-border-primary)',
              cursor: 'pointer'
            }}
            title="Close Statistics"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      
      {/* Scrollable Content Area */}
      <div 
        className="custom-scroll"
        style={{ 
          flex: '1 1 0',
          height: '100vh',
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '1rem',
          minHeight: 300
        }}
      >
        {/* --- CONTROLS SECTION --- */}
        <div className="mb-8 p-6 border rounded-lg shadow-sm fade-in" style={{ ...boxStyle, borderRadius: '12px' }}>
        
        <div className="flex flex-col md:flex-row gap-6">
        {/* Left Column: Context */}
        <div className="flex-1 lg:border-r lg:pr-6 flex flex-col pb-4 lg:pb-0 border-b lg:border-b-0" style={{ borderColor: 'var(--rn-clr-border-primary)' }}>
          <div className="flex items-center gap-2 mb-2 md:mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            </svg>
            <h4 className="font-bold text-xs md:text-sm uppercase tracking-wide opacity-70">Context</h4>
          </div>
          <div className="flex flex-col gap-1.5 md:gap-2">
            <label className="flex items-center space-x-2 cursor-pointer text-sm md:text-base">
              <input 
                type="radio" 
                checked={contextMode === 'Global'} 
                onChange={() => setContextMode('Global')}
                className="form-radio w-4 h-4"
                style={{ accentColor: chartColor }}
              />
              <span>Global</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer text-sm md:text-base">
              <input 
                type="radio" 
                checked={contextMode === 'Current'} 
                onChange={() => setContextMode('Current')}
                className="form-radio w-4 h-4"
                style={{ accentColor: chartColor }}
              />
              <span className="truncate" title={contextMode === 'Current' ? contextRemName : "Current Rem"}>
                {contextMode === 'Current' ? contextRemName : "Current Rem"}
              </span>
            </label>
          </div>
          
          {contextMode === 'Current' && (
             <div className="mt-2 pl-6 flex flex-col gap-1">
                <div className="text-xs opacity-50 uppercase tracking-wide mb-1">Scope</div>
                <label className="flex items-center space-x-2 cursor-pointer text-xs">
                    <input 
                        type="radio" 
                        checked={scopeMode === 'descendants'} 
                        onChange={() => setScopeMode('descendants')}
                        className="form-radio h-3 w-3"
                        style={{ accentColor: chartColor }}
                    />
                    <span>Descendants Only</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer text-xs">
                    <input 
                        type="radio" 
                        checked={scopeMode === 'comprehensive'} 
                        onChange={() => setScopeMode('comprehensive')}
                        className="form-radio h-3 w-3"
                        style={{ accentColor: chartColor }}
                    />
                    <span>Comprehensive</span>
                    <div 
                      className="opacity-50 hover:opacity-100 cursor-help transition-opacity"
                      title="Descendants, Rems that reference or are tagged with this rem and its descendants, Sources, Portals and Table Views"
                    >
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        width="15" 
                        height="15" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                      </svg>
                    </div>
                </label>
             </div>
          )}

          <div className="mt-3 lg:mt-auto pt-3 lg:pt-4">
              <div className="p-2 md:p-3 rounded-lg" style={{ backgroundColor: 'var(--rn-clr-background-tertiary)' }}>
                <div className="text-xs opacity-70 uppercase tracking-wide mb-1">Total Flashcards</div>
                <div className="text-xl md:text-2xl font-bold" style={{ color: chartColor }}>
                    {activeCardsSource ? activeCardsSource.length.toLocaleString() : '-'}
                </div>
              </div>
          </div>
        </div>

        {/* Right Column: Period Selection */}
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
               <div style={{ gridColumn: '1', gridRow: '1 / 3' }}>
                 {renderPresetBtn('Today', 'Today')}
               </div>
               <div style={{ gridColumn: '1', gridRow: '3' }}>
                 {renderPresetBtn('Yesterday', 'Yesterday')}
               </div>

               <div style={{ gridColumn: '2', gridRow: '1' }}>{renderPresetBtn('Week', 'Week')}</div>
               <div style={{ gridColumn: '2', gridRow: '2' }}>{renderPresetBtn('This Week', 'This Week')}</div>
               <div style={{ gridColumn: '2', gridRow: '3' }}>{renderPresetBtn('Last Week', 'Last Week')}</div>

               <div style={{ gridColumn: '3', gridRow: '1' }}>{renderPresetBtn('Month', 'Month')}</div>
               <div style={{ gridColumn: '3', gridRow: '2' }}>{renderPresetBtn('This Month', 'This Month')}</div>
               <div style={{ gridColumn: '3', gridRow: '3' }}>{renderPresetBtn('Last Month', 'Last Month')}</div>

               <div style={{ gridColumn: '4', gridRow: '1' }}>{renderPresetBtn('Year', 'Year')}</div>
               <div style={{ gridColumn: '4', gridRow: '2' }}>{renderPresetBtn('This Year', 'This Year')}</div>
               <div style={{ gridColumn: '4', gridRow: '3' }}>{renderPresetBtn('Last Year', 'Last Year')}</div>

               <div style={{ gridColumn: '5', gridRow: '1 / 4' }}>
                  <button
                    onClick={() => handleRangeChange('All')}
                    className="w-full h-full rounded px-2 py-1 text-xs transition-all hover:opacity-90 flex items-center justify-center font-bold"
                    style={getBtnStyle('All')}
                  >
                    All
                  </button>
               </div>
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
               <button 
                 onClick={() => handleRangeChange('All')}
                 className="text-xs hover:underline mb-2 ml-auto"
                 style={{ color: chartColor }}
               >
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
      ) : contextMode === 'Current' && scopeError ? (
        <ErrorState onRetry={() => setScopeRetry(value => value + 1)} />
      ) : !activeCardsSource || activeCardsSource.length === 0 ? (
        <EmptyState
          title="No flashcards found"
          description={contextMode === 'Global'
            ? 'Start creating flashcards to see your statistics here.'
            : 'No flashcards found in the selected context. Try switching to Global mode or selecting a different Rem.'}
        />
      ) : (
        <>
          {selectedReviewCount === 0 && (
            <div className="mb-6">
              <EmptyState
                title="No reviews in this period"
                description="The selected scope has cards, but no review activity in this date range. Try widening the range to see historical activity."
              />
            </div>
          )}
          {/* SECTION 1: HEATMAP */}
          <div className="mb-6 md:mb-10 fade-in">
            <SectionHeader title="Study Overview" description="Daily review activity and learning consistency" icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 md:w-6 md:h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: chartColor }}>
                  <rect x="3" y="3" width="7" height="7"></rect>
                  <rect x="14" y="3" width="7" height="7"></rect>
                  <rect x="14" y="14" width="7" height="7"></rect>
                  <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
            } />
            <ChartCard>
            {renderHeatmap(
              categorizeDataByWeekday(heatmapData), 
              heatmapColorLow, 
              heatmapColorMedium, 
              heatmapColorHigh, 
              heatmapMidPoint,
              heatmapTarget
            )}
            </ChartCard>
            
            <div className="metric-grid metric-grid-three mt-6">
              <MetricCard label="Days Learned" value={daysLearned} supporting="Days with at least one review" accent={chartColor} />
              <MetricCard label="Daily Average" value={isNaN(dailyAverage) ? 0 : dailyAverage} supporting="Reviews per calendar day" accent={chartColor} />
              <MetricCard label="Longest Streak" value={`${longestStreak} days`} supporting="Consecutive review days" accent={chartColor} />
            </div>
          </div>

          <div className="section-divider"></div>

          {/* SECTION 2: REVIEW STATISTICS */}
          <div className="mb-6 md:mb-10 fade-in">
            <SectionHeader title="Review Performance" description="Retention, review volume, outcomes, and total time" icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 md:w-6 md:h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: chartColor }}>
                  <path d="M3 3v18h18"></path>
                  <path d="M18 17V9"></path>
                  <path d="M13 17V5"></path>
                  <path d="M8 17v-3"></path>
                </svg>
            } />

            {/* Metrics Grid */}
            <div className="metric-grid metric-grid-five mb-6 md:mb-8">
              <MetricCard
                label={<span className="inline-flex items-center justify-center gap-1">Retention Rate <span className="opacity-50 hover:opacity-100 cursor-help transition-opacity" title="The percentage of reviews where you successfully recalled the answer (Score > Forgot).&#010;Calculation: (Hard + Good + Easy) / Total Reviews" aria-label="Retention rate calculation help">ⓘ</span></span>}
                value={retentionRate(buttonsPressedDataObj) === "No Data" ? "N/A" : `${(parseFloat(retentionRate(buttonsPressedDataObj)) * 100).toFixed(0)}%`}
                supporting={retentionRate(buttonsPressedDataObj) !== "No Data" && parseFloat(retentionRate(buttonsPressedDataObj)) === 1.0 ? <span className="font-semibold" style={{ color: '#10b981' }}>🏆 Perfect! You're unstoppable! 🏆</span> : undefined}
                accent={chartColor}
              />
              <MetricCard label="Total Reviews" value={buttonsPressedTotal.toLocaleString()} accent={chartColor} />
              <MetricCard label="Forgot" value={(buttonsPressedDataObj.Forgot || 0).toLocaleString()} accent="#ef4444" />

              {/* Remembered card with hidden Easter Bunny */}
              <div
                className="relative cursor-pointer"
                style={{ overflow: 'visible' }}
                onMouseEnter={() => setShowEasterBunny(true)}
                onMouseLeave={() => setShowEasterBunny(false)}
                onClick={() => setShowEasterBunny(!showEasterBunny)}
              >
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ opacity: showEasterBunny ? 1 : 0, transition: 'opacity 1s ease-in-out', zIndex: 0, left: '-10px' }}>
                  <div className="text-6xl animate-bounce">🐰</div>
                </div>
                <div className="remembered-metric-card-shell" style={{ transform: showEasterBunny ? 'translateX(70px)' : 'translateX(0)' }}>
                  <MetricCard
                    label="Remembered"
                    value={((buttonsPressedDataObj.Hard || 0) + (buttonsPressedDataObj.Good || 0) + (buttonsPressedDataObj.Easy || 0)).toLocaleString()}
                    supporting={showEasterBunny ? <span style={{ color: '#10b981' }}>🥕 Peek-a-boo!</span> : undefined}
                    accent="#10b981"
                  />
                </div>
              </div>

              <MetricCard
                label={<span className="inline-flex items-center justify-center gap-1">Time Spent <span className="opacity-50 hover:opacity-100 cursor-help transition-opacity" title="Total time spent reviewing flashcards in the selected time period" aria-label="Time spent help">ⓘ</span></span>}
                value={formatTime(timeStatsSummary.totalTimeMs)}
                supporting={timeStatsSummary.totalTimeMs > 0 ? `${formatTime(timeStatsSummary.averageTimePerReviewDay)}/day studied` : undefined}
                accent="#f59e0b"
              />
            </div>

            <div className="section-divider section-divider-subsection"></div>
            <SectionHeader
              title="Review Behavior"
              description="Button choices, repetition patterns, and retention trends"
              icon={<span aria-hidden="true">↗</span>}
            />

            <div className="space-y-4 md:space-y-6">

            <div className="chart-container">
              {chart_column_with_percent(
                buttonsPressedData, 
                'category', 
                'Buttons pressed',
                buttonsPressedTotal
              )}
            </div>

            <div className="chart-container">
              {chart_column(
                getNumberCardsGroupedByRepetitions(filteredCards), 
                'category', 
                'Number of cards grouped by number of reviews')}
            </div>

            <div className="chart-container">
              {chart_repetionsCompounded(filteredCards)}
            </div>

            <div className="chart-container">
              {chart_retention_rate_over_time(
                retentionRateOverTimeData,
                retentionRateWeeklyMA,
                retentionRateMonthlyMA,
                retentionRateCumulativeAvg,
                'Retention rate over time'
              )}
            </div>

            <div className="chart-container">
              {chart_retention_by_time_of_day(
                timeOfDayRetentionData,
                'Retention rate by time of day'
              )}
            </div>

            <div className="section-divider section-divider-subsection"></div>
            <SectionHeader
              title="Speed and Efficiency"
              description="Time spent, recall speed, and response-time distribution"
              icon={<span aria-hidden="true">◷</span>}
            />

            <div className="chart-container">
              {chart_time_spent(
                timeStatsData,
                timeStatsSummary,
                'Time spent reviewing'
              )}
            </div>

            <div className="chart-container">
              {chart_recall_speed(
                recallSpeedData,
                recallSpeedMovingAverage,
                recallSpeedSummary,
                'Recall speed over time'
              )}
            </div>

            <div className="chart-container">
              {chart_response_time_distribution(
                responseTimeDistribution,
                'Response time distribution'
              )}
            </div>
            </div>
          </div>

          <div className="section-divider"></div>

          {/* SECTION 3: OUTLOOK */}
          <div className="mb-6 md:mb-8 fade-in">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 md:gap-4 mb-4 md:mb-6">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="p-1.5 md:p-2 rounded-lg" style={{ backgroundColor: 'var(--rn-clr-background-secondary)' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 md:w-6 md:h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: chartColor }}>
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                </div>
                <div>
                  <div className="font-bold text-lg md:text-xl">Plan Ahead</div>
                  <div className="text-xs md:text-sm opacity-60 hidden sm:block">Upcoming due cards forecast</div>
                </div>
              </div>
              <div className="flex gap-1 md:gap-2 text-xs md:text-sm p-1 md:p-1.5 rounded-lg" style={{ backgroundColor: 'var(--rn-clr-background-secondary)', border: '1px solid var(--rn-clr-border-primary)' }}>
                {[
                  { label: 'Week', val: 7 },
                  { label: 'Month', val: 30 },
                  { label: 'Year', val: 365 }
                ].map(opt => (
                  <button
                    key={opt.label}
                    onClick={() => setDueOutlook(opt.val)}
                    className="px-2 md:px-4 py-1 md:py-2 rounded-md transition-all smooth-transition font-medium text-xs md:text-sm"
                    style={dueOutlook === opt.val 
                      ? { backgroundColor: chartColor, color: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }
                      : { color: 'var(--rn-clr-content-secondary)' }
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <MetricCard
              className="mb-4 md:mb-6"
              label={`Total Due Cards (Next ${dueOutlook} Days)`}
              value={dueCardsTotal.toLocaleString()}
              supporting="Upcoming due cards forecast"
              accent={chartColor}
            />

            <div className="chart-container">
              {chart_column_due(
                dueCardsDataRaw, 
                `Due cards per day`, 
                dueCardsCumulative
              )}
            </div>
          </div>

          <div className="section-divider"></div>

          {/* SECTION 4: HARDEST FLASHCARDS */}
          <div className="mb-6 md:mb-8 fade-in">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 md:gap-4 mb-4 md:mb-6">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="p-1.5 md:p-2 rounded-lg" style={{ backgroundColor: 'var(--rn-clr-background-secondary)' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 md:w-6 md:h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#ef4444' }}>
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                </div>
                <div>
                  <div className="font-bold text-lg md:text-xl">Cards to Improve</div>
                  <div className="text-xs md:text-sm opacity-60 hidden sm:block">Cards with lowest retention rate (min. 3 reviews)</div>
                </div>
              </div>
              <div className="flex gap-1 md:gap-2 text-xs md:text-sm p-1 md:p-1.5 rounded-lg" style={{ backgroundColor: 'var(--rn-clr-background-secondary)', border: '1px solid var(--rn-clr-border-primary)' }}>
                {[
                  { label: 'Top 10', val: 10 },
                  { label: 'Top 20', val: 20 },
                  { label: 'Top 50', val: 50 }
                ].map(opt => (
                  <button
                    key={opt.label}
                    onClick={() => setHardestCardsLimit(opt.val)}
                    className="px-2 md:px-4 py-1 md:py-2 rounded-md transition-all smooth-transition font-medium text-xs md:text-sm"
                    style={hardestCardsLimit === opt.val 
                      ? { backgroundColor: '#ef4444', color: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }
                      : { color: 'var(--rn-clr-content-secondary)' }
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {hardestCardsData.length === 0 ? (
              <div className="stat-card p-6 md:p-8 border rounded-lg text-center" style={{ borderColor: 'var(--rn-clr-border-primary)', backgroundColor: 'var(--rn-clr-background-secondary)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 mx-auto mb-3 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M16 16s-1.5-2-4-2-4 2-4 2"></path>
                  <line x1="9" y1="9" x2="9.01" y2="9"></line>
                  <line x1="15" y1="9" x2="15.01" y2="9"></line>
                </svg>
                <div className="text-sm opacity-60">No difficult cards found with 3+ reviews</div>
                <div className="text-xs opacity-40 mt-1">Keep studying to collect more data!</div>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden" style={{ borderColor: 'var(--rn-clr-border-primary)' }}>
                {/* Table Header */}
                <div className="grid grid-cols-12 gap-2 p-3 text-xs font-semibold uppercase tracking-wide opacity-70" style={{ backgroundColor: 'var(--rn-clr-background-tertiary)' }}>
                  <div className="col-span-1 text-center">#</div>
                  <div className="col-span-5 md:col-span-6">Flashcard</div>
                  <div className="col-span-2 text-center hidden sm:block">Reviews</div>
                  <div className="col-span-2 text-center hidden sm:block">Forgot</div>
                  <div className="col-span-6 sm:col-span-2 text-center">Retention</div>
                </div>
                {/* Table Body */}
                <div className="divide-y" style={{ borderColor: 'var(--rn-clr-border-primary)' }}>
                  {hardestCardsData.map((card, index) => (
                    <HardestCardRow 
                      key={card.cardId}
                      card={card}
                      index={index}
                      plugin={plugin}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
      </div>
    </div>
  );
}

// --- Hardest Card Row Component ---

interface HardestCardRowProps {
  card: HardCardData;
  index: number;
  plugin: ReturnType<typeof usePlugin>;
}

function HardestCardRow({ card, index, plugin }: HardestCardRowProps) {
  const [remText, setRemText] = React.useState<string>('Loading...');
  const [isHovered, setIsHovered] = React.useState(false);

  // Fetch the Rem text
  React.useEffect(() => {
    let cancelled = false;
    
    async function fetchRemText() {
      try {
        const rem = await plugin.rem.findOne(card.remId);
        if (cancelled) return;
        
        if (!rem) {
          setRemText('(Rem not found)');
          return;
        }
        
        const text = rem.text ? await plugin.richText.toString(rem.text) : null;
        if (cancelled) return;
        
        if (text && text.trim().length > 0) {
          // Truncate long text
          const truncated = text.length > 80 ? text.substring(0, 80) + '...' : text;
          setRemText(truncated);
        } else {
          setRemText('(Untitled)');
        }
      } catch (error) {
        if (!cancelled) {
          setRemText('(Error loading)');
        }
      }
    }

    fetchRemText();
    return () => { cancelled = true; };
  }, [card.remId, plugin]);

  const handleClick = async () => {
    try {
      const rem = await plugin.rem.findOne(card.remId);
      if (rem) {
        await plugin.window.openRem(rem);
      }
    } catch (error) {
      console.error('Stats Plugin: Error opening Rem:', error);
    }
  };

  // Color based on retention rate (red for low, yellow for medium)
  const getRetentionColor = (rate: number) => {
    if (rate <= 30) return '#ef4444'; // red
    if (rate <= 50) return '#f97316'; // orange
    if (rate <= 70) return '#eab308'; // yellow
    return '#22c55e'; // green
  };

  return (
    <div 
      className="grid grid-cols-12 gap-2 p-3 items-center cursor-pointer transition-all"
      style={{ 
        backgroundColor: isHovered ? 'var(--rn-clr-background-tertiary)' : 'var(--rn-clr-background-primary)',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
    >
      {/* Rank */}
      <div className="col-span-1 text-center">
        <span className="text-sm font-medium opacity-60">{index + 1}</span>
      </div>
      
      {/* Flashcard Text */}
      <div className="col-span-5 md:col-span-6">
        <div 
          className="text-sm truncate hover:underline"
          style={{ color: isHovered ? 'var(--rn-clr-link)' : 'var(--rn-clr-content-primary)' }}
          title={remText}
        >
          {remText}
        </div>
      </div>
      
      {/* Reviews Count */}
      <div className="col-span-2 text-center hidden sm:block">
        <span className="text-sm">{card.totalReviews}</span>
      </div>
      
      {/* Forgot Count */}
      <div className="col-span-2 text-center hidden sm:block">
        <span className="text-sm" style={{ color: '#ef4444' }}>{card.forgotCount}</span>
      </div>
      
      {/* Retention Rate */}
      <div className="col-span-6 sm:col-span-2 text-center">
        <span 
          className="inline-block px-2 py-1 rounded-full text-xs font-semibold"
          style={{ 
            backgroundColor: `${getRetentionColor(card.retentionRate)}20`,
            color: getRetentionColor(card.retentionRate)
          }}
        >
          {card.retentionRate.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

// --- Chart Rendering Functions ---

function renderHeatmap(
  WeekdaySeries: any, 
  colorLow: string, 
  colorMedium: string, 
  colorHigh: string, 
  midPoint: number,
  lowerBound: number
) {
    const options = {
          xaxis: {
            type: 'datetime' as const,
            labels: { style: { colors: 'var(--rn-clr-content-primary)' } },
            tooltip: { enabled: false }
          },
          chart: {
            zoom: { enabled: false }, 
            toolbar: { show: false },
            foreColor: 'var(--rn-clr-content-primary)',
            background: 'transparent'
          },
          dataLabels: { enabled: false },
          legend: {
            show: true,
            position: 'top' as const,
            horizontalAlign: 'right' as const,
            labels: { colors: 'var(--rn-clr-content-primary)' },
          },
          colors: [colorHigh],
          plotOptions: {
            heatmap: {
              shadeIntensity: 0.5,
              radius: 2,
              useFillColorAsStroke: false,
              colorScale: {
                ranges: [{
                  from: 0,
                  to: 0,
                  color: 'var(--rn-clr-background-tertiary)',
                  name : '0',
                },
                {
                  from: 1,
                  to: midPoint,
                  color: colorLow,
                  name: `Low: 1 - ${midPoint}`,
                },
                {
                  from: midPoint + 1,
                  to: lowerBound,
                  color: colorMedium,
                  name: `Medium: ${midPoint + 1} - ${lowerBound}`,
                },
                {
                  from: lowerBound + 1,
                  to: 1000000,
                  color: colorHigh,
                  name: `High: > ${lowerBound}`,
                }
              ]
              }
            }
          },
          stroke: {
            width: 1,
            colors: ['var(--rn-clr-background-primary)']
          },
          tooltip: { 
             theme: 'light',
             x: { show: true, format: 'dd MMM yyyy' },
             y: {
                 formatter: function(val: any) {
                     return val + " reviews";
                 }
             }
          }
    };
    
    const series = [
            { name: "Sunday", data: WeekdaySeries.Sunday },
            { name: "Saturday", data: WeekdaySeries.Saturday },
            { name: "Friday", data: WeekdaySeries.Friday },
            { name: "Thursday", data: WeekdaySeries.Thursday },
            { name: "Wednesday", data: WeekdaySeries.Wednesday },
            { name: "Tuesday", data: WeekdaySeries.Tuesday },
            { name: "Monday", data: WeekdaySeries.Monday }
    ];
    
    return <div className="mt-4">
    <Chart
        options={options}
        series={series}
        type="heatmap"
        width="100%"
        height="250"
    />
    </div>
}

function chart_column_due(data: any[][], title: string, cumulativeData: number[]) {
  const options = {
    ...getCommonChartOptions(title, 'datetime'),
    dataLabels: { enabled: false },
    xaxis: {
      ...getCommonChartOptions(title, 'datetime').xaxis,
      tickAmount: 'dataPoints' as const,
    },
    tooltip: {
      y: {
        formatter: function(val: number, opts: any) {
           const cum = cumulativeData[opts.dataPointIndex];
           return `Daily: ${val}  (Cumulative: ${cum})`;
        }
      }
    }
  };

  return <div>
  <Chart
    options={options}
    type="bar"
    width="100%"
    height="300"
    series={[{ name: 'Cards', data: data }]}/></div>;
}

function chart_column_with_percent(data: Array<{x: string, y: number}>, xaxisType: 'datetime' | 'category' | 'numeric', title: string, total: number) {
  const options = {
    ...getCommonChartOptions(title, xaxisType),
    dataLabels: {
      enabled: true,
      formatter: function (val: number) {
        if (total === 0) return "0%";
        return ((val / total) * 100).toFixed(1) + "%";
      },
      style: {
        colors: ['var(--rn-clr-content-primary)'] 
      },
      offsetY: -20,
    },
    plotOptions: {
      bar: {
        dataLabels: { position: 'top' as const },
      }
    },
    tooltip: {
      y: {
        formatter: function(val: number) {
           if (total === 0) return val.toString();
           const pct = ((val / total) * 100).toFixed(1);
           return `${val} (${pct}%)`;
        }
      }
    }
  };

  return <div>
  <Chart
    options={options}
    type="bar"
    width="100%"
    height="300"
    series={[{ name: 'Count', data: data }]}/></div>;
}

function chart_column(data: Array<{x: number, y: number}>, xaxisType: 'datetime' | 'category' | 'numeric', title: string) {
  const options = {
    ...getCommonChartOptions(title, xaxisType),
    dataLabels: { enabled: false },
    xaxis: {
      ...getCommonChartOptions(title, xaxisType).xaxis,
      tickAmount: 'dataPoints' as const,
    }
  };

  return <div>
  <Chart
    options={options}
    type="bar"
    width="100%"
    height="300"
    series={[{ name: 'Cards', data: data }]}/></div>;
}

function chart_repetionsCompounded(allCards: Card[] | undefined) {
  const data = getRepetitionsPerDayObject(allCards);
  if (!data) return <div/>;
  const sorted = data.sort((a,b) => a.date - b.date);
  const series = sorted.map((item) => [item.date, item.repetitions]);
  
  for(let i = 1; i < series.length; i++) {
    series[i][1] = series[i][1] + series[i-1][1];
  }

  const options = {
    ...getCommonChartOptions('Sum of reviews over time', 'datetime'),
    dataLabels: { enabled: false },
    stroke: { colors: [chartColor], curve: 'smooth' as const },
    chart: {
      ...getCommonChartOptions('Sum of reviews over time', 'datetime').chart,
    },
    fill: { type: 'solid' as const, colors: [chartColor] },
    tooltip: { enabled: true, x: { format: 'dd MM yyyy' } },
  };

  return <div><Chart
    options={options}
    series={[{ name: 'Total Reviews', data: series }]}
    type="area"
    width="100%"
    height="300"
  /></div>
}

function chart_retention_rate_over_time(
  dailyData: Array<{x: number, y: number}>,
  weeklyMA: Array<{x: number, y: number}>,
  monthlyMA: Array<{x: number, y: number}>,
  cumulativeAvg: Array<{x: number, y: number}>,
  title: string
) {
  if (!dailyData || dailyData.length === 0) return <div/>;

  const options = {
    ...getCommonChartOptions(title, 'datetime'),
    dataLabels: { enabled: false },
    stroke: {
      curve: 'smooth' as const,
      width: [3, 2, 2, 2],
      dashArray: [0, 4, 6, 2]
    },
    colors: [chartColor, '#10b981', '#f59e0b', '#8b5cf6'],
    legend: {
      show: true,
      position: 'top' as const,
      horizontalAlign: 'right' as const,
      labels: { colors: 'var(--rn-clr-content-primary)' },
      onItemClick: { toggleDataSeries: true },
      onItemHover: { highlightDataSeries: true }
    },
    yaxis: {
      min: 0,
      max: 100,
      tickAmount: 5,
      labels: {
        style: { colors: 'var(--rn-clr-content-primary)' },
        formatter: function (val: number) {
          return val.toFixed(1) + '%';
        }
      }
    },
    tooltip: {
      theme: 'light' as const,
      x: { format: 'dd MMM yyyy' },
      y: {
        formatter: function(val: number) {
          return val.toFixed(1) + '%';
        },
        title: { formatter: (seriesName: string) => seriesName }
      }
    },
    markers: {
      size: 0,
      hover: { size: 5 }
    }
  };

  const series = [
    { name: 'Retention (Daily)', data: dailyData },
    { name: 'Retention (7d MA)', data: weeklyMA },
    { name: 'Retention (30d MA)', data: monthlyMA },
    { name: 'Retention (Cumulative Avg)', data: cumulativeAvg }
  ];

  return <div>
  <Chart
    options={options}
    type="line"
    width="100%"
    height="300"
    series={series}
  /></div>;
}

function chart_retention_by_time_of_day(
  data: TimeOfDayRetention[],
  title: string
) {
  if (!data || data.length === 0) return <div/>;

  // Filter out blocks with no reviews
  const blocksWithData = data.filter(block => block.totalReviews > 0);

  if (blocksWithData.length === 0) {
    return <div className="p-8 text-center opacity-60">
      <div className="text-sm">No data available</div>
      <div className="text-xs mt-1">Review some flashcards to see your productivity patterns</div>
    </div>;
  }

  // Prepare data for chart
  const chartData = blocksWithData.map(block => ({
    x: block.timeBlock,
    y: block.retentionRate,
    reviews: block.totalReviews,
    forgot: block.forgotCount,
    remembered: block.rememberedCount
  }));

  // Find the best time (highest retention)
  const bestBlock = blocksWithData.reduce((max, block) => 
    block.retentionRate > max.retentionRate ? block : max
  , blocksWithData[0]);

  const options = {
    ...getCommonChartOptions(title, 'category'),
    dataLabels: {
      enabled: true,
      formatter: function (val: number) {
        return val.toFixed(1) + '%';
      },
      style: {
        colors: ['var(--rn-clr-content-primary)'],
        fontSize: '11px',
        fontWeight: 600
      },
      offsetY: -20,
    },
    plotOptions: {
      bar: {
        dataLabels: { position: 'top' as const },
        distributed: true,
        borderRadius: 4
      }
    },
    colors: chartData.map(d => {
      // Color code based on retention rate
      if (d.y >= 80) return '#10b981'; // green
      if (d.y >= 70) return '#84cc16'; // lime
      if (d.y >= 60) return '#eab308'; // yellow
      if (d.y >= 50) return '#f97316'; // orange
      return '#ef4444'; // red
    }),
    xaxis: {
      ...getCommonChartOptions(title, 'category').xaxis,
      labels: {
        style: { colors: 'var(--rn-clr-content-primary)' },
        rotate: -45,
        rotateAlways: true,
        hideOverlappingLabels: false
      }
    },
    yaxis: {
      min: 0,
      max: 100,
      tickAmount: 5,
      labels: {
        style: { colors: 'var(--rn-clr-content-primary)' },
        formatter: function (val: number) {
          return val.toFixed(0) + '%';
        }
      }
    },
    tooltip: {
      theme: 'light' as const,
      y: {
        formatter: function(val: number, opts: any) {
          const dataPoint = chartData[opts.dataPointIndex];
          return `
            <div style="padding: 4px 0;">
              <div><strong>Retention:</strong> ${val.toFixed(1)}%</div>
              <div><strong>Total Reviews:</strong> ${dataPoint.reviews}</div>
              <div><strong>Remembered:</strong> ${dataPoint.remembered}</div>
              <div><strong>Forgot:</strong> ${dataPoint.forgot}</div>
            </div>
          `;
        },
        title: { formatter: () => '' }
      }
    },
    legend: {
      show: false
    }
  };

  return <div>
    {bestBlock && (
      <MetricCard
        className="mb-4 md:mb-6"
        label="🎯 Most Productive Time"
        value={bestBlock.timeBlock}
        supporting={`${bestBlock.retentionRate.toFixed(1)}% retention rate (${bestBlock.totalReviews} reviews)`}
        accent="#10b981"
      />
    )}
    <Chart
      options={options}
      type="bar"
      width="100%"
      height="300"
      series={[{ name: 'Retention Rate', data: chartData }]}
    />
  </div>;
}

function chart_time_spent(
  timeData: DailyTimeStats[],
  summary: TimeStatsSummary,
  title: string
) {
  if (!timeData || timeData.length === 0) return <div className="p-8 text-center opacity-60">
    <div className="text-sm">No time data available</div>
    <div className="text-xs mt-1">Time tracking data will appear as you review flashcards</div>
  </div>;

  // Prepare data for bar chart (time in minutes per day)
  const chartData = timeData.map(day => ({
    x: day.date,
    y: Math.round((day.timeMs / 1000 / 60) * 10) / 10 // Convert to minutes, round to 1 decimal
  }));

  // Prepare cumulative time data (in hours)
  let cumulativeTimeMs = 0;
  const cumulativeData = timeData.map(day => {
    cumulativeTimeMs += day.timeMs;
    return {
      x: day.date,
      y: Math.round((cumulativeTimeMs / 1000 / 60 / 60) * 100) / 100 // Convert to hours, round to 2 decimals
    };
  });

  const options = {
    ...getCommonChartOptions(title, 'datetime'),
    dataLabels: { enabled: false },
    stroke: {
      width: [0, 2], // 0 for bars, 2 for area line
      curve: 'smooth' as const
    },
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
    plotOptions: {
      bar: {
        borderRadius: 2,
        columnWidth: '85%'
      }
    },
    colors: ['#f59e0b', '#3362f0'], // amber for daily time, blue for cumulative
    xaxis: {
      ...getCommonChartOptions(title, 'datetime').xaxis,
      type: 'datetime' as const,
      labels: {
        format: 'MMM dd',
        style: { colors: 'var(--rn-clr-content-primary)' }
      }
    },
    yaxis: [
      {
        // Left axis for daily time (minutes)
        seriesName: 'Daily Time',
        decimalsInFloat: 1,
        labels: { 
          style: { colors: 'var(--rn-clr-content-primary)' },
          formatter: function(val: number) {
            return val.toFixed(1) + 'm';
          }
        },
        title: {
          text: 'Time (minutes)',
          style: { color: 'var(--rn-clr-content-primary)' }
        }
      },
      {
        // Right axis for cumulative time (hours)
        seriesName: 'Cumulative Time',
        opposite: true,
        decimalsInFloat: 1,
        labels: { 
          style: { colors: 'var(--rn-clr-content-primary)' },
          formatter: function(val: number) {
            return val.toFixed(1) + 'h';
          }
        },
        title: {
          text: 'Cumulative Time (hours)',
          style: { color: 'var(--rn-clr-content-primary)' }
        }
      }
    ],
    tooltip: {
      theme: 'light' as const,
      x: { format: 'dd MMM yyyy' },
      y: {
        formatter: function(val: number, opts: any) {
          const seriesIndex = opts.seriesIndex;
          if (seriesIndex === 0) {
            // Daily time bar
            const dayIndex = opts.dataPointIndex;
            const reviews = timeData[dayIndex]?.reviewCount || 0;
            return `${val.toFixed(1)} minutes (${reviews} reviews)`;
          } else {
            // Cumulative time area
            return `${val.toFixed(2)} hours total`;
          }
        }
      }
    },
    legend: {
      show: true,
      position: 'top' as const,
      horizontalAlign: 'center' as const,
      labels: {
        colors: 'var(--rn-clr-content-primary)'
      }
    }
  };

  return <div>
    {/* Summary Statistics */}
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

    {/* Chart */}
    <Chart
      options={options}
      type="line"
      width="100%"
      height="300"
      series={[
        { 
          name: 'Daily Time', 
          type: 'bar',
          data: chartData 
        },
        { 
          name: 'Cumulative Time', 
          type: 'area',
          data: cumulativeData 
        }
      ]}
    />
  </div>;
}

function chart_recall_speed(
  dailyData: RecallSpeedDataPoint[],
  movingAverage: RecallSpeedDataPoint[],
  summary: RecallSpeedSummary | undefined,
  title: string
) {
  if (!dailyData || dailyData.length === 0) return <div className="p-8 text-center opacity-60">
    <div className="text-sm">No recall-speed data available</div>
    <div className="text-xs mt-1">Response-time trends will appear as you review flashcards</div>
  </div>;

  const chartData = dailyData.map(day => ({
    x: day.date,
    y: day.averageResponseTimeMs / 1000
  }));
  const medianChartData = dailyData.map(day => ({
    x: day.date,
    y: (day.medianResponseTimeMs ?? 0) / 1000
  }));
  const movingAverageData = movingAverage.map(day => ({
    x: day.date,
    y: day.averageResponseTimeMs / 1000
  }));
  const remainingDaysForComparison = Math.max(0, 14 - dailyData.length);
  const comparison = summary?.comparison;
  const comparisonColor = comparison?.direction === 'faster'
    ? '#10b981'
    : comparison?.direction === 'slower'
      ? '#ef4444'
      : 'var(--rn-clr-content-primary)';
  const comparisonText = comparison
    ? comparison.direction === 'unchanged'
      ? 'No change from the previous 7 study days'
      : `${formatTime(Math.abs(comparison.differenceMs), 'seconds')} ${comparison.direction} (${Math.abs(comparison.percentageChange).toFixed(1)}%)`
    : remainingDaysForComparison > 0
      ? `Compare after ${remainingDaysForComparison} more study day${remainingDaysForComparison === 1 ? '' : 's'}`
      : 'Comparison unavailable';

  const options = {
    ...getCommonChartOptions(title, 'datetime'),
    dataLabels: { enabled: false },
    stroke: {
      curve: 'smooth' as const,
      width: [2, 2, 3],
      dashArray: [0, 3, 5]
    },
    colors: [chartColor, '#8b5cf6', '#f59e0b'],
    xaxis: {
      ...getCommonChartOptions(title, 'datetime').xaxis,
      type: 'datetime' as const,
      labels: {
        format: 'MMM dd',
        style: { colors: 'var(--rn-clr-content-primary)' }
      }
    },
    yaxis: {
      min: 0,
      labels: {
        style: { colors: 'var(--rn-clr-content-primary)' },
        formatter: function(val: number) {
          return `${val.toFixed(1)}s`;
        }
      },
      title: {
        text: 'Response time (seconds/card)',
        style: { color: 'var(--rn-clr-content-primary)' }
      }
    },
    tooltip: {
      theme: 'light' as const,
      x: { format: 'dd MMM yyyy' },
      y: {
        formatter: function(val: number, opts: any) {
          if (opts.seriesIndex === 0) {
            const point = dailyData[opts.dataPointIndex];
            return `${val.toFixed(2)} seconds/card (${point?.reviewCount || 0} of ${point?.totalReviewCount || 0} timed reviews retained)`;
          }
          if (opts.seriesIndex === 1) {
            return `${val.toFixed(2)} seconds/card (daily median)`;
          }
          return `${val.toFixed(2)} seconds/card (7-study-day average)`;
        }
      }
    },
    markers: {
      size: [3, 3, 0],
      hover: { size: 5 }
    },
    legend: {
      show: true,
      position: 'top' as const,
      horizontalAlign: 'right' as const,
      labels: { colors: 'var(--rn-clr-content-primary)' },
      onItemClick: { toggleDataSeries: true },
      onItemHover: { highlightDataSeries: true }
    }
  };

  return <div>
    <div className="metric-grid metric-grid-two mb-3 md:mb-4">
      <MetricCard
        label="Response Time"
        value={`${formatTime(summary?.averageResponseTimeMs || 0, 'seconds')}/card`}
        supporting={`Latest ${summary?.studyDaysIncluded || 0} study day${summary?.studyDaysIncluded === 1 ? '' : 's'}`}
        accent={chartColor}
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
        { name: 'Daily Response Time', data: chartData },
        { name: 'Daily Median Response Time', data: medianChartData },
        { name: '7 Study Day Average', data: movingAverageData }
      ]}
    />
  </div>;
}

function chart_response_time_distribution(
  distribution: ResponseTimeDistribution | undefined,
  title: string
) {
  if (!distribution) return <div className="p-8 text-center opacity-60">
    <div className="text-sm">No response-time data available</div>
    <div className="text-xs mt-1">A distribution will appear as you review flashcards</div>
  </div>;

  const toSeconds = (milliseconds: number) => milliseconds / 1000;
  const boxPlotData = [{
    x: 'Selected period',
    y: [
      toSeconds(distribution.lowerWhiskerMs),
      toSeconds(distribution.q1Ms),
      toSeconds(distribution.medianMs),
      toSeconds(distribution.q3Ms),
      toSeconds(distribution.upperWhiskerMs)
    ]
  }];
  const formatStatistic = (milliseconds: number) => `${formatTime(milliseconds, 'seconds')}/card`;
  const distributionSummary = `${distribution.reviewCount.toLocaleString()} timed reviews · average ${formatStatistic(distribution.averageMs)} · ${distribution.lowOutlierCount} low outlier${distribution.lowOutlierCount === 1 ? '' : 's'} · ${distribution.highOutlierCount} high outlier${distribution.highOutlierCount === 1 ? '' : 's'}`;
  const options = {
    ...getCommonChartOptions(title, 'category'),
    subtitle: {
      text: distributionSummary,
      align: 'left' as const,
      offsetY: 24,
      style: {
        color: 'var(--rn-clr-content-secondary)',
        fontSize: '11px',
        fontWeight: 400
      }
    },
    plotOptions: {
      bar: {
        horizontal: true
      },
      boxPlot: {
        colors: {
          upper: '#8b5cf6',
          lower: chartColor
        }
      }
    },
    xaxis: {
      ...getCommonChartOptions(title, 'category').xaxis,
      labels: {
        formatter: function(value: string) {
          const seconds = Number(value);
          return Number.isFinite(seconds) ? `${seconds.toFixed(1)}s` : value;
        },
        style: { colors: 'var(--rn-clr-content-primary)' }
      },
      title: {
        text: 'Response time (seconds/card)',
        style: { color: 'var(--rn-clr-content-primary)' }
      }
    },
    annotations: {
      xaxis: [{
        x: toSeconds(distribution.averageMs),
        borderColor: '#f59e0b',
        strokeDashArray: 4,
        label: {
          text: `Average: ${formatStatistic(distribution.averageMs)}`,
          style: {
            background: '#f59e0b',
            color: '#1f2937',
            fontSize: '10px'
          }
        }
      }]
    },
    yaxis: {
      labels: {
        style: { colors: 'var(--rn-clr-content-primary)' }
      }
    },
    tooltip: {
      theme: 'light' as const,
      custom: function() {
        return `<div style="padding: 8px 12px; line-height: 1.5">
          <strong>Selected period</strong><br />
          ${distribution.reviewCount} timed reviews<br />
          Average: ${formatStatistic(distribution.averageMs)}<br />
          Lower whisker: ${formatStatistic(distribution.lowerWhiskerMs)}<br />
          Q1: ${formatStatistic(distribution.q1Ms)}<br />
          Median: ${formatStatistic(distribution.medianMs)}<br />
          Q3: ${formatStatistic(distribution.q3Ms)}<br />
          Upper whisker: ${formatStatistic(distribution.upperWhiskerMs)}<br />
          Outliers: ${distribution.lowOutlierCount} low, ${distribution.highOutlierCount} high
        </div>`;
      }
    },
    legend: {
      show: false
    }
  };

  return <div>
    <Chart
      options={options}
      type="boxPlot"
      width="100%"
      height="280"
      series={[
        { name: 'Response Time Distribution', data: boxPlotData }
      ]}
    />
  </div>;
}

renderWidget(Statistics);
