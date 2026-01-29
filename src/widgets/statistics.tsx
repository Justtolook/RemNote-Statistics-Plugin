import { usePlugin, renderWidget, useTrackerPlugin, Card, useRunAsync, PluginRem } from '@remnote/plugin-sdk';
import Chart from 'react-apexcharts';
import React from 'react';
import { getComprehensiveContextRems } from '../lib/utils';
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
  getNumberRepetitionsGroupedByScore,
  getNumberCardsGroupedByRepetitions,
  getRepetitionsPerDayObject,
  getRepetitionsPerDayOptimized,
  categorizeDataByWeekday,
  getLongestStreak,
  getDailyAverage,
  interpolateColor
} from '../lib/dataProcessing';

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
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  };

  const initial = React.useMemo(() => getInitialState(), []);

  // -- State Management --
  const [contextMode, setContextMode] = React.useState<'Global' | 'Current'>('Global');
  const [scopeMode, setScopeMode] = React.useState<'descendants' | 'comprehensive'>('descendants');
  const [rangeMode, setRangeMode] = React.useState<RangeMode>(initial.mode);
  const [dateStart, setDateStart] = React.useState<string>(initial.start);
  const [dateEnd, setDateEnd] = React.useState<string>(initial.end);
  const [dueOutlook, setDueOutlook] = React.useState<number>(30);

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

  // -- Global Data --
  const allGlobalCards = useTrackerPlugin(async (reactivePlugin) => await reactivePlugin.card.getAll());

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
  const allCardsInContext = useRunAsync(async () => {
    if (!contextRem) {
      console.log("Stats Plugin: Context Rem not ready yet.");
      return undefined;
    }

    let allRems: PluginRem[] = [];

    if (scopeMode === 'descendants') {
        console.log(`Stats Plugin: Fetching simple descendants for ${contextRem._id}...`);
        const descendants = await contextRem.getDescendants();
        allRems = [contextRem, ...descendants];
    } else {
        console.log(`Stats Plugin: Fetching comprehensive context for ${contextRem._id}...`);
        allRems = await getComprehensiveContextRems(contextRem);
    }
    
    const resultCards: Card[] = [];
    const BATCH_THRESHOLD = 200;

    if (allRems.length > BATCH_THRESHOLD) {
        console.log(`Stats Plugin: Scope too large (${allRems.length} Rems). Switching to bulk fetch.`);
        const allSystemCards = await plugin.card.getAll();
        const scopeRemIds = new Set(allRems.map(r => r._id));
        const filtered = allSystemCards.filter(c => scopeRemIds.has(c.remId));
        resultCards.push(...filtered);
    } else {
        console.log(`Stats Plugin: Small scope (${allRems.length} Rems). Using iterative fetching.`);
        await Promise.all(allRems.map(async (rem) => {
          const cards = await rem.getCards();
          if (cards && cards.length > 0) {
            resultCards.push(...cards);
          }
        }));
    }

    console.log(`Stats Plugin: Found ${resultCards.length} total cards in context (Mode: ${scopeMode}).`);
    return resultCards;
  }, [contextRem, scopeMode]);

  // -- Range Change Handler --
  const handleRangeChange = (mode: RangeMode) => {
    setRangeMode(mode);
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
        setDateStart('');
        setDateEnd('');
        return;
    }

    setDateStart(start.toISOString().split('T')[0]);
    setDateEnd(end.toISOString().split('T')[0]);
  };
  
  const isLoadingContext = contextMode === 'Current' && allCardsInContext === undefined;
  const activeCardsSource = contextMode === 'Global' ? allGlobalCards : allCardsInContext;

  // -- Filtered Data for History Charts --
  const filteredCards = React.useMemo(() => {
    if (!activeCardsSource) return [];
    if (!dateStart && !dateEnd) return activeCardsSource;

    const startUnix = dateStart ? new Date(dateStart).getTime() : 0;
    const endUnix = dateEnd ? new Date(dateEnd).getTime() + (24 * 60 * 60 * 1000) : Infinity;

    return activeCardsSource.map(card => {
       const filteredHistory = (card.repetitionHistory || []).filter(rep => {
          return rep.date >= startUnix && rep.date < endUnix;
       });
       const copy = Object.assign(Object.create(Object.getPrototypeOf(card)), card);
       copy.repetitionHistory = filteredHistory;
       return copy;
    });
  }, [activeCardsSource, dateStart, dateEnd]);

  // -- Filtered Data for Heatmap --
  const heatmapData = React.useMemo(() => {
    if (!activeCardsSource) return [];
    const startTs = dateStart ? new Date(dateStart).getTime() : 0;
    const endTs = dateEnd ? new Date(dateEnd).getTime() + (24 * 60 * 60 * 1000) : Infinity;
    return getRepetitionsPerDayOptimized(activeCardsSource, startTs, endTs);
  }, [activeCardsSource, dateStart, dateEnd]);

  // -- Prepared Data --
  const buttonsPressedDataObj = getNumberRepetitionsGroupedByScore(filteredCards);
  const buttonsPressedTotal = Object.values(buttonsPressedDataObj).reduce((a:any, b:any) => a + b, 0) as number;
  const buttonsPressedData = transformObjectToCategoryFormat(buttonsPressedDataObj);

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

  

  return (
    <div 
      style={{ 
        display: 'flex',
        flexDirection: 'column',
        height: '90%',
        overflow: 'hidden',
        ...containerStyle
      }} 
      className="statisticsBody"
    >
      {/* Header - Fixed */}
      <div style={{ flex: '0 0 auto', padding: '1.5rem 1.5rem 1rem 1.5rem', borderBottom: '1px solid var(--rn-clr-border-primary)' }}>
        <div className="flex items-center gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: chartColor }}>
            <line x1="18" y1="20" x2="18" y2="10"></line>
            <line x1="12" y1="20" x2="12" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="14"></line>
          </svg>
          <div>
            <div className="font-bold text-2xl" style={{ color: 'var(--rn-clr-content-primary)' }}>Statistics Dashboard</div>
            <div className="text-sm opacity-60">Comprehensive flashcard analytics and review insights</div>
          </div>
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
          padding: '1.5rem',
          minHeight: 0
        }}
      >
        {/* --- CONTROLS SECTION --- */}
        <div className="mb-8 p-6 border rounded-lg shadow-sm fade-in" style={{ ...boxStyle, borderRadius: '12px' }}>
        
        <div className="flex flex-col md:flex-row gap-6">
        {/* Left Column: Context */}
        <div className="flex-1 md:border-r pr-6 flex flex-col" style={{ borderColor: 'var(--rn-clr-border-primary)' }}>
          <div className="flex items-center gap-2 mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            </svg>
            <h4 className="font-bold text-sm uppercase tracking-wide opacity-70">Context</h4>
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input 
                type="radio" 
                checked={contextMode === 'Global'} 
                onChange={() => setContextMode('Global')}
                className="form-radio"
                style={{ accentColor: chartColor }}
              />
              <span>Global</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input 
                type="radio" 
                checked={contextMode === 'Current'} 
                onChange={() => setContextMode('Current')}
                className="form-radio"
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

          <div className="mt-auto pt-4">
              <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--rn-clr-background-tertiary)' }}>
                <div className="text-xs opacity-70 uppercase tracking-wide mb-1">Total Flashcards</div>
                <div className="text-2xl font-bold" style={{ color: chartColor }}>
                    {activeCardsSource ? activeCardsSource.length.toLocaleString() : '-'}
                </div>
              </div>
          </div>
        </div>

        {/* Right Column: Period Selection */}
        <div className="flex-[3] flex flex-col gap-3">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              <h4 className="font-bold text-sm uppercase tracking-wide opacity-70">Period</h4>
            </div>
            
            <div 
              className="grid gap-1.5" 
              style={{ 
                gridTemplateColumns: 'repeat(5, 1fr)', 
                gridTemplateRows: 'repeat(3, auto)' 
              }}
            >
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

          <div className="flex flex-wrap gap-4 items-end mt-2">
            <div className="flex flex-col">
              <span className="text-xs opacity-70 mb-1">Start Date</span>
              <input 
                type="date" 
                value={dateStart} 
                onChange={(e) => { setDateStart(e.target.value); setRangeMode('All'); }}
                className="border rounded px-2 py-1 text-sm w-32"
                style={inputStyle}
              />
            </div>
            <div className="flex flex-col">
              <span className="text-xs opacity-70 mb-1">End Date</span>
              <input 
                type="date" 
                value={dateEnd} 
                onChange={(e) => { setDateEnd(e.target.value); setRangeMode('All'); }}
                className="border rounded px-2 py-1 text-sm w-32"
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
          </div>
        </div>
        </div>
      </div>

      {/* --- CONTENT --- */}
      
      {isLoadingContext ? (
        <div className="flex flex-col justify-center items-center h-64 fade-in">
          <div className="loading-pulse mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: chartColor }}>
              <line x1="12" y1="2" x2="12" y2="6"></line>
              <line x1="12" y1="18" x2="12" y2="22"></line>
              <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
              <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
              <line x1="2" y1="12" x2="6" y2="12"></line>
              <line x1="18" y1="12" x2="22" y2="12"></line>
              <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
              <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
            </svg>
          </div>
          <div className="text-lg font-medium" style={{ color: 'var(--rn-clr-content-primary)' }}>
            Loading context data...
          </div>
          <div className="text-sm opacity-60 mt-2">
            Analyzing flashcards in the selected scope
          </div>
        </div>
      ) : !activeCardsSource || activeCardsSource.length === 0 ? (
        <div className="flex flex-col justify-center items-center h-64 fade-in">
          <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--rn-clr-content-tertiary)', marginBottom: '1rem' }}>
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
          </svg>
          <div className="text-xl font-medium mb-2" style={{ color: 'var(--rn-clr-content-primary)' }}>
            No flashcards found
          </div>
          <div className="text-sm opacity-60 text-center max-w-md">
            {contextMode === 'Global' 
              ? 'Start creating flashcards to see your statistics here.' 
              : 'No flashcards found in the selected context. Try switching to Global mode or selecting a different Rem.'}
          </div>
        </div>
      ) : (
        <>
          {/* SECTION 1: HEATMAP */}
          <div className="mb-10 fade-in">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--rn-clr-background-secondary)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: chartColor }}>
                  <rect x="3" y="3" width="7" height="7"></rect>
                  <rect x="14" y="3" width="7" height="7"></rect>
                  <rect x="14" y="14" width="7" height="7"></rect>
                  <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
              </div>
              <div>
                <div className="font-bold text-xl">Review Heatmap</div>
                <div className="text-sm opacity-60">Daily review activity visualization</div>
              </div>
            </div>
            <div className="chart-container">
            {renderHeatmap(
              categorizeDataByWeekday(heatmapData), 
              heatmapColorLow, 
              heatmapColorMedium, 
              heatmapColorHigh, 
              heatmapMidPoint,
              heatmapTarget
            )}
            </div>
            
            <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="stat-card p-4 border rounded-lg text-center" style={{ borderColor: 'var(--rn-clr-border-primary)', backgroundColor: 'var(--rn-clr-background-primary)' }}>
                <div className="text-xs uppercase tracking-wide opacity-60 mb-2">Days Learned</div>
                <div className="text-3xl font-bold" style={{ color: chartColor }}>{daysLearned}</div>
              </div>
              <div className="stat-card p-4 border rounded-lg text-center" style={{ borderColor: 'var(--rn-clr-border-primary)', backgroundColor: 'var(--rn-clr-background-primary)' }}>
                <div className="text-xs uppercase tracking-wide opacity-60 mb-2">Daily Average</div>
                <div className="text-3xl font-bold" style={{ color: chartColor }}>{isNaN(dailyAverage) ? 0 : dailyAverage}</div>
              </div>
              <div className="stat-card p-4 border rounded-lg text-center" style={{ borderColor: 'var(--rn-clr-border-primary)', backgroundColor: 'var(--rn-clr-background-primary)' }}>
                <div className="text-xs uppercase tracking-wide opacity-60 mb-2">Longest Streak</div>
                <div className="text-3xl font-bold" style={{ color: chartColor }}>{longestStreak} days</div>
              </div>
            </div>
          </div>

          <div className="section-divider"></div>

          {/* SECTION 2: REVIEW STATISTICS */}
          <div className="mb-10 fade-in">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--rn-clr-background-secondary)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: chartColor }}>
                  <path d="M3 3v18h18"></path>
                  <path d="M18 17V9"></path>
                  <path d="M13 17V5"></path>
                  <path d="M8 17v-3"></path>
                </svg>
              </div>
              <div>
                <div className="font-bold text-xl">Review Statistics</div>
                <div className="text-sm opacity-60">Performance metrics and review distribution</div>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="mb-8 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="stat-card p-4 border rounded-lg text-center" style={{ borderColor: 'var(--rn-clr-border-primary)', backgroundColor: 'var(--rn-clr-background-primary)' }}>
                <div className="text-xs uppercase tracking-wide opacity-60 mb-2 flex items-center justify-center gap-1">
                  Retention Rate
                  <div 
                    className="opacity-50 hover:opacity-100 cursor-help transition-opacity"
                    title="The percentage of reviews where you successfully recalled the answer (Score > Forgot).&#010;Calculation: (Hard + Good + Easy) / Total Reviews"
                  >
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      width="14" 
                      height="14" 
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
                </div>
                <div className="text-3xl font-bold" style={{ color: chartColor }}>
                  {retentionRate(buttonsPressedDataObj) === "No Data" 
                    ? "N/A" 
                    : (parseFloat(retentionRate(buttonsPressedDataObj)) * 100).toFixed(0) + "%"}
                </div>
              </div>
              <div className="stat-card p-4 border rounded-lg text-center" style={{ borderColor: 'var(--rn-clr-border-primary)', backgroundColor: 'var(--rn-clr-background-primary)' }}>
                <div className="text-xs uppercase tracking-wide opacity-60 mb-2">Total Reviews</div>
                <div className="text-3xl font-bold" style={{ color: chartColor }}>{buttonsPressedTotal.toLocaleString()}</div>
              </div>
              <div className="stat-card p-4 border rounded-lg text-center" style={{ borderColor: 'var(--rn-clr-border-primary)', backgroundColor: 'var(--rn-clr-background-primary)' }}>
                <div className="text-xs uppercase tracking-wide opacity-60 mb-2">Forgot</div>
                <div className="text-3xl font-bold" style={{ color: '#ef4444' }}>{(buttonsPressedDataObj.Forgot || 0).toLocaleString()}</div>
              </div>
              <div className="stat-card p-4 border rounded-lg text-center" style={{ borderColor: 'var(--rn-clr-border-primary)', backgroundColor: 'var(--rn-clr-background-primary)' }}>
                <div className="text-xs uppercase tracking-wide opacity-60 mb-2">Remembered</div>
                <div className="text-3xl font-bold" style={{ color: '#10b981' }}>
                  {((buttonsPressedDataObj.Hard || 0) + (buttonsPressedDataObj.Good || 0) + (buttonsPressedDataObj.Easy || 0)).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="space-y-6">

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
            </div>
          </div>

          <div className="section-divider"></div>

          {/* SECTION 3: OUTLOOK */}
          <div className="mb-8 fade-in">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--rn-clr-background-secondary)' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: chartColor }}>
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                </div>
                <div>
                  <div className="font-bold text-xl">Outlook</div>
                  <div className="text-sm opacity-60">Upcoming due cards forecast</div>
                </div>
              </div>
              <div className="flex gap-2 text-sm p-1.5 rounded-lg" style={{ backgroundColor: 'var(--rn-clr-background-secondary)', border: '1px solid var(--rn-clr-border-primary)' }}>
                {[
                  { label: 'Week', val: 7 },
                  { label: 'Month', val: 30 },
                  { label: 'Year', val: 365 }
                ].map(opt => (
                  <button
                    key={opt.label}
                    onClick={() => setDueOutlook(opt.val)}
                    className="px-4 py-2 rounded-md transition-all smooth-transition font-medium"
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

            <div className="stat-card p-4 border rounded-lg mb-6 text-center" style={{ borderColor: 'var(--rn-clr-border-primary)', backgroundColor: 'var(--rn-clr-background-secondary)' }}>
              <div className="text-sm opacity-70 mb-1">Total Due Cards (Next {dueOutlook} Days)</div>
              <div className="text-4xl font-bold" style={{ color: chartColor }}>{dueCardsTotal.toLocaleString()}</div>
            </div>

            <div className="chart-container">
              {chart_column_due(
                dueCardsDataRaw, 
                `Due cards per day`, 
                dueCardsCumulative
              )}
            </div>
          </div>
        </>
      )}
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

renderWidget(Statistics);
