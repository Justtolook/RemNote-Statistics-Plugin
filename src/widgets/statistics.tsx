import { usePlugin, renderWidget, useTrackerPlugin, Card, useRunAsync, WidgetLocation, PluginRem } from '@remnote/plugin-sdk';
import Chart from 'react-apexcharts';
import React from 'react';
import { getComprehensiveContextRems } from '../lib/utils';

/* Constants */
var chartColor = '#3362f0';

type RangeMode = 'Today' | 'Yesterday' | 'Week' | 'This Week' | 'Last Week' | 'Month' | 'This Month' | 'Last Month' | 'Year' | 'This Year' | 'Last Year' | 'All';

/* Functions */
export const Statistics = () => {
  const plugin = usePlugin();
  
  // -- Initialization Helper --
  // Initialize with 'This Year' by default
  const getInitialState = () => {
    const t = new Date();
    const start = new Date(t.getFullYear(), 0, 1); // Jan 1st current year
    const end = t; // Today
    return {
      mode: 'This Year' as RangeMode,
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  };

  const initial = React.useMemo(() => getInitialState(), []);

  // -- State Management --
  const [contextMode, setContextMode] = React.useState<'Global' | 'Current'>('Global');
  // NEW: Local state for Scope Mode (defaulting to descendants)
  const [scopeMode, setScopeMode] = React.useState<'descendants' | 'comprehensive'>('descendants');
  
  const [rangeMode, setRangeMode] = React.useState<RangeMode>(initial.mode);
  const [dateStart, setDateStart] = React.useState<string>(initial.start);
  const [dateEnd, setDateEnd] = React.useState<string>(initial.end);
  const [dueOutlook, setDueOutlook] = React.useState<number>(30); // Default Month

  // -- Settings --
  const chartColorSettings = useTrackerPlugin(() => plugin.settings.getSetting('statistics-chart-color'));

  if(chartColorSettings && /^#[0-9A-F]{6}$/i.test(chartColorSettings)) {
    chartColor = chartColorSettings;
  }

  // -- 1. Global Data (Always loaded via Tracker) --
  const allGlobalCards = getAllCards();

  // -- 2. Context (Session) Fetching --
  const sessionContext = useTrackerPlugin(async (reactivePlugin) => {
    return await reactivePlugin.storage.getSession<{focusedRemId: string}>('statistics-context');
  }, []);
  const contextRemId = sessionContext?.focusedRemId;

  // -- 3. Context Rem & Name Resolution --
  const contextRem = useRunAsync(async () => {
    if (!contextRemId) return undefined;
    return await plugin.rem.findOne(contextRemId);
  }, [contextRemId]);

  const contextRemName = useRunAsync(async () => {
     if(!contextRemId) return "No Rem Detected";
     if(!contextRem) return "Loading...";
     const text = await plugin.richText.toString(contextRem.text);
     return text && text.trim().length > 0 ? text : "Untitled Rem";
  }, [contextRem]);
  
  // -- 4. DATA FETCH --
  const allCardsInContext = useRunAsync(async () => {
    if (!contextRem) {
      console.log("Stats Plugin: Context Rem not ready yet.");
      return undefined;
    }

    let allRems: PluginRem[] = [];

    // 1. Gather Rems based on scope
    if (scopeMode === 'descendants') {
        console.log(`Stats Plugin: Fetching simple descendants for ${contextRem._id}...`);
        const descendants = await contextRem.getDescendants();
        allRems = [contextRem, ...descendants];
    } else {
        console.log(`Stats Plugin: Fetching comprehensive context for ${contextRem._id}...`);
        allRems = await getComprehensiveContextRems(contextRem);
    }
    
    // 2. Optimized Card Fetching Strategy
    const resultCards: Card[] = [];
    const BATCH_THRESHOLD = 200; // Threshold to switch to bulk fetching

    if (allRems.length > BATCH_THRESHOLD) {
        // STRATEGY A: Bulk fetch all cards (1 Request) -> Filter locally
        // Much faster for large scopes (e.g. 650 Rems) to avoid N+1 request overhead
        console.log(`Stats Plugin: Scope too large (${allRems.length} Rems) for individual fetching. Switching to bulk fetch strategy.`);
        
        const allSystemCards = await plugin.card.getAll();
        const scopeRemIds = new Set(allRems.map(r => r._id));
        
        // Filter cards that belong to the Rems in our scope
        const filtered = allSystemCards.filter(c => scopeRemIds.has(c.remId));
        resultCards.push(...filtered);
    } else {
        // STRATEGY B: Individual fetch (N Requests)
        // Faster for very small scopes (avoids loading the entire global card database)
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

  // -- Filtering Logic --
  
  const handleRangeChange = (mode: RangeMode) => {
    setRangeMode(mode);
    const t = new Date(); // Today
    
    // Helper to clone date to avoid reference issues
    const getToday = () => new Date(t);

    let start = getToday();
    let end = getToday();

    switch (mode) {
      case 'Today':
        // Start = Today, End = Today
        break;
        
      case 'Yesterday':
        start.setDate(t.getDate() - 1);
        end.setDate(t.getDate() - 1);
        break;

      case 'Week': // Last 7 days
        start.setDate(t.getDate() - 7);
        break;

      case 'This Week': // Since last Sunday
        // t.getDay(): 0 (Sun) to 6 (Sat)
        start.setDate(t.getDate() - t.getDay());
        break;

      case 'Last Week': // Prev Sunday to Prev Saturday
        // End is last Saturday (Today - DayOfWeek - 1)
        end.setDate(t.getDate() - t.getDay() - 1);
        start = new Date(end);
        start.setDate(end.getDate() - 6);
        break;

      case 'Month': // Last 30 days
        start.setDate(t.getDate() - 30);
        break;

      case 'This Month': // 1st of current month to Today
        start = new Date(t.getFullYear(), t.getMonth(), 1);
        break;

      case 'Last Month': // 1st to last day of previous month
        start = new Date(t.getFullYear(), t.getMonth() - 1, 1);
        end = new Date(t.getFullYear(), t.getMonth(), 0);
        break;

      case 'Year': // Last 365 days
        start.setDate(t.getDate() - 365);
        break;
      
      case 'This Year': // Jan 1st to Today
        start = new Date(t.getFullYear(), 0, 1);
        break;

      case 'Last Year': // Previous calendar year
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
  
  // Determine if we are loading
  const isLoadingContext = contextMode === 'Current' && allCardsInContext === undefined;
  
  // Select Source
  const activeCardsSource = contextMode === 'Global' ? allGlobalCards : allCardsInContext;

  const filteredCards = React.useMemo(() => {
    // If we are loading, or if global cards haven't loaded yet, return empty
    if (!activeCardsSource) return [];
    
    // If no date filter, return source
    if (!dateStart && !dateEnd) return activeCardsSource;

    const startUnix = dateStart ? new Date(dateStart).getTime() : 0;
    const endUnix = dateEnd ? new Date(dateEnd).getTime() + (24 * 60 * 60 * 1000) : Infinity;

    return activeCardsSource.map(card => {
       const filteredHistory = (card.repetitionHistory || []).filter(rep => {
          return rep.date >= startUnix && rep.date < endUnix;
       });
       // Create shallow copy to attach filtered history
       const copy = Object.assign(Object.create(Object.getPrototypeOf(card)), card);
       copy.repetitionHistory = filteredHistory;
       return copy;
    });
  }, [activeCardsSource, dateStart, dateEnd]);

  // -- Prepared Data --
  const buttonsPressedDataObj = getNumberRepetitionsGroupedByScore(filteredCards);
  const buttonsPressedTotal = Object.values(buttonsPressedDataObj).reduce((a:any, b:any) => a + b, 0) as number;
  const buttonsPressedData = transformObjectToCategoryFormat(buttonsPressedDataObj);

  // Due Cards Logic
  const dueCardsDataRaw = getFutureDueCards(activeCardsSource, dueOutlook);
  const dueCardsTotal = dueCardsDataRaw.reduce((sum, item) => sum + item[1], 0);
  
  let runningTotal = 0;
  const dueCardsCumulative = dueCardsDataRaw.map(item => {
    runningTotal += item[1];
    return runningTotal;
  });

  // -- CSS Variables --
  const containerStyle = { color: 'var(--rn-clr-content-primary)' };
  const boxStyle = { 
    backgroundColor: 'var(--rn-clr-background-secondary)', 
    borderColor: 'var(--rn-clr-border-primary)',
    color: 'var(--rn-clr-content-primary)' 
  };
  const inputStyle = {
    backgroundColor: 'var(--rn-clr-background-primary)',
    borderColor: 'var(--rn-clr-border-primary)',
    color: 'var(--rn-clr-content-primary)',
  };

  // -- Button Style Helper --
  const getBtnStyle = (mode: RangeMode) => {
    const isSelected = rangeMode === mode;
    return {
      backgroundColor: isSelected ? chartColor : 'var(--rn-clr-background-primary)',
      color: isSelected ? '#fff' : 'var(--rn-clr-content-secondary)',
      border: isSelected ? 'none' : '1px solid var(--rn-clr-border-primary)',
      // Small shadow for unselected buttons to match "button" feel, or simple border
      boxShadow: isSelected ? 'none' : '0 1px 2px 0 rgba(0, 0, 0, 0.05)', 
    };
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

  return <div style={{ ...containerStyle, maxHeight: "calc(90vh)" }} className="statisticsBody overflow-y-auto">

    <div className="font-bold text-lg">History</div>
    
    {/* --- CONTROLS SECTION --- */}
    <div className="mb-6 p-4 border rounded-md flex flex-col md:flex-row gap-6" style={boxStyle}>
      
      {/* Left Column: Context */}
      <div className="flex-1 border-r border-gray-200 dark:border-gray-700 pr-4 flex flex-col">
        <h4 className="font-bold mb-2 text-sm uppercase tracking-wide opacity-70">Context</h4>
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
        
        {/* Scope Selection (Conditional) */}
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
                    {/* Info Icon with Tooltip */}
                    <div 
                      className="opacity-50 hover:opacity-100 cursor-help transition-opacity"
                      title="Descendants, Rems that reference or are tagged with this rem and its descendants, Sources, Portals and Table Viewes"
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

        {/* Total Flashcards Count */}
        <div className="mt-auto pt-4">
            <div className="text-xs opacity-70 uppercase tracking-wide">Total Flashcards</div>
            <div className="text-xl font-bold">
                {activeCardsSource ? activeCardsSource.length.toLocaleString() : '-'}
            </div>
        </div>
      </div>

      {/* Right Column: Period Selection */}
      <div className="flex-[3] flex flex-col gap-3">
        
        {/* Top Row: Preset Buttons */}
        <div className="">
          <h4 className="font-bold text-sm uppercase tracking-wide opacity-70 mb-2">Period</h4>
          
          {/* 5 columns, 3 rows grid */}
          <div 
            className="grid gap-1.5" 
            style={{ 
              gridTemplateColumns: 'repeat(5, 1fr)', 
              gridTemplateRows: 'repeat(3, auto)' 
            }}
          >
             {/* -- Column 1: Day -- */}
             {/* Today spans Row 1-2 */}
             <div style={{ gridColumn: '1', gridRow: '1 / 3' }}>
               {renderPresetBtn('Today', 'Today')}
             </div>
             {/* Yesterday Row 3 */}
             <div style={{ gridColumn: '1', gridRow: '3' }}>
               {renderPresetBtn('Yesterday', 'Yesterday')}
             </div>

             {/* -- Column 2: Week -- */}
             <div style={{ gridColumn: '2', gridRow: '1' }}>{renderPresetBtn('Week', 'Week')}</div>
             <div style={{ gridColumn: '2', gridRow: '2' }}>{renderPresetBtn('This Week', 'This Week')}</div>
             <div style={{ gridColumn: '2', gridRow: '3' }}>{renderPresetBtn('Last Week', 'Last Week')}</div>

             {/* -- Column 3: Month -- */}
             <div style={{ gridColumn: '3', gridRow: '1' }}>{renderPresetBtn('Month', 'Month')}</div>
             <div style={{ gridColumn: '3', gridRow: '2' }}>{renderPresetBtn('This Month', 'This Month')}</div>
             <div style={{ gridColumn: '3', gridRow: '3' }}>{renderPresetBtn('Last Month', 'Last Month')}</div>

             {/* -- Column 4: Year -- */}
             <div style={{ gridColumn: '4', gridRow: '1' }}>{renderPresetBtn('Year', 'Year')}</div>
             <div style={{ gridColumn: '4', gridRow: '2' }}>{renderPresetBtn('This Year', 'This Year')}</div>
             <div style={{ gridColumn: '4', gridRow: '3' }}>{renderPresetBtn('Last Year', 'Last Year')}</div>

             {/* -- Column 5: All -- */}
             {/* All spans Rows 1-3 */}
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

        {/* Bottom Row: Date Inputs */}
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

    {/* --- LOADING STATE / CHARTS SECTION --- */}
    
    {isLoadingContext ? (
      <div className="flex justify-center items-center h-40">
        <div className="text-lg animate-pulse" style={{ color: 'var(--rn-clr-content-secondary)' }}>
          Loading context data...
        </div>
      </div>
    ) : (
      <>

        {/* 1. Retention Rate */}
        <div className="mb-2 flex items-center">
          <b>Retention rate: </b> 
          <span className="mx-1">{(retentionRate(buttonsPressedDataObj))}</span>
          
          {/* Info Icon with Tooltip */}
          <div 
            className="opacity-50 hover:opacity-100 cursor-help transition-opacity"
            title="The percentage of reviews where you successfully recalled the answer (Score > Forgot).&#010;Calculation: (Hard + Good + Easy) / Total Reviews"
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
        </div>

        {/* 2. Buttons Pressed */}
        {chart_column_with_percent(
          buttonsPressedData, 
          'category', 
          'Buttons pressed',
          buttonsPressedTotal
        )}

        {/* 3. Reviews Count */}
        {chart_column(
          getNumberCardsGroupedByRepetitions(filteredCards), 
          'category', 
          'Number of cards grouped by number of reviews')}

        {/* 4. Compounded Reviews */}
        {chart_repetionsCompounded(filteredCards)}

        <hr></hr>

        {/* 5. Due Cards */}
        <div className="mt-8 mb-2">
          <div className="flex justify-between items-center mb-2">
            <div className="font-bold text-lg">Outlook</div>
            <div className="flex gap-2 text-sm p-1 rounded" style={{ backgroundColor: 'var(--rn-clr-background-secondary)' }}>
              {[
                { label: 'Week', val: 7 },
                { label: 'Month', val: 30 },
                { label: 'Year', val: 365 }
              ].map(opt => (
                <button
                  key={opt.label}
                  onClick={() => setDueOutlook(opt.val)}
                  className={`px-3 py-1 rounded transition-colors`}
                  style={dueOutlook === opt.val 
                    ? { backgroundColor: chartColor, color: '#fff' }
                    : { color: 'var(--rn-clr-content-secondary)' }
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {chart_column_due(
          dueCardsDataRaw, 
          `Due in next ${dueOutlook} days (Total: ${dueCardsTotal})`, 
          dueCardsCumulative
        )}
      </>
    )}
    
  </div>;

}

// --- Helper Functions ---

function getCommonChartOptions(title: String, xaxisType: String) {
  return {
    chart: {
      foreColor: 'var(--rn-clr-content-primary)',
      fontFamily: 'inherit',
      toolbar: { show: false }
    },
    title: {
      text: title,
      style: { color: 'var(--rn-clr-content-primary)' }
    },
    colors: [chartColor],
    xaxis: {
      type: xaxisType,
      labels: { style: { colors: 'var(--rn-clr-content-primary)' } }
    },
    yaxis: {
      decimalsInFloat: 0,
      labels: { style: { colors: 'var(--rn-clr-content-primary)' } }
    },
    tooltip: {
      theme: 'light',
    },
    grid: {
      show: true,
      borderColor: 'var(--rn-clr-border-light-accent)',
      strokeDashArray: 4,
      position: 'back',
      xaxis: {
        lines: { show: false }
      },
      yaxis: {
        lines: { show: true }
      }
    }
  };
}

function chart_column_due(data: any[][], title: String, cumulativeData: number[]) {
  const options = {
    ...getCommonChartOptions(title, 'datetime'),
    dataLabels: { enabled: false },
    xaxis: {
      ...getCommonChartOptions(title, 'datetime').xaxis,
      tickAmount: 'dataPoints',
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

function chart_column_with_percent(data: any[][], xaxisType: String, title: String, total: number) {
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
        dataLabels: { position: 'top' },
      }
    },
    tooltip: {
      y: {
        formatter: function(val: number) {
           if (total === 0) return val;
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

function chart_column(data: any[][], xaxisType: String, title: String, xMax?: number) {
  const options = {
    ...getCommonChartOptions(title, xaxisType),
    dataLabels: { enabled: false },
    xaxis: {
      ...getCommonChartOptions(title, xaxisType).xaxis,
      tickAmount: 'dataPoints',
      max: xMax ? undefined : undefined,
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

function getFutureDueCards(allCards, daysOutlook: Number) {
  if (!allCards) return [];
  var futureDueCards =  allCards.filter((card) => card.nextRepetitionTime > Date.now());
  var futureDueDates = futureDueCards.map((card) => new Date(card.nextRepetitionTime));
  const futureDueDatesGroupedByDay = futureDueDates.reduce((r, a) => {
    r[a.toDateString()] = ++r[a.toDateString()] || 1;
    return r;
  }, Object.create(Object));
  const data = Object.keys(futureDueDatesGroupedByDay ||{}).map((key) => {
    return [Date.parse(key), futureDueDatesGroupedByDay[key]];
  });
  data.sort((a,b) => a[0] - b[0]);
  const today = new Date();
  today.setHours(0,0,0,0);
  const todayUnix = Number(today.getTime());
  const days = Number(daysOutlook);
  const futureDueDatesGroupedByDayUnix = Array.from({length: days}, (v, i) => [todayUnix + i * 24 * 60 * 60 * 1000, 0]);
  for(let i = 0; i < data.length; i++) {
    for(let j = 0; j < futureDueDatesGroupedByDayUnix.length; j++) {
      if(new Date(data[i][0]).toDateString() === new Date(futureDueDatesGroupedByDayUnix[j][0]).toDateString()) {
        futureDueDatesGroupedByDayUnix[j][1] = data[i][1];
      }
    }
  }
  return futureDueDatesGroupedByDayUnix;
}

function getNumberRepetitionsGroupedByScore(allCards) {
  var data = {"Skip": 0, "Forgot": 0, "Hard": 0, "Good": 0, "Easy": 0};
  if (!allCards) return data;
  for(let a in allCards) {
    for(let r in allCards[a].repetitionHistory) {
      let score = allCards[a].repetitionHistory[r].score;
      switch(score) {
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

function transformObjectToCategoryFormat(data) {
  return Object.keys(data).map((key) => {
    return {x: key, y: data[key]};
  });
}

function retentionRate(data) {
  var a = data["Forgot"];
  var b = data["Hard"]+ data["Good"] + data["Easy"];
  if ((a+b) === 0) return "No Data";
  return (b/(a+b)).toFixed(2);
}

function chart_repetionsCompounded(allCards) {
  var data = getRepetitionsPerDayObject(allCards);
  if (!data) return <div/>;
  data = data.sort((a,b) => a.date - b.date);
  var series = Object.keys(data).map((key) => [data[key]['date'], data[key]['repetitions']]);
  for(var i = 1; i < series.length; i++) {
    series[i][1] = series[i][1] + series[i-1][1];
  }

  const options = {
    ...getCommonChartOptions('Sum of reviews over time', 'datetime'),
    dataLabels: { enabled: false },
    stroke: { colors: [chartColor], curve: 'smooth' },
    chart: {
      ...getCommonChartOptions('Sum of reviews over time', 'datetime').chart,
      zoom: { enabled: true, type: 'xy', autoScaleYaxis: true },
    },
    fill: { type: 'solid', colors: [chartColor] },
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

function getAllCards() {
  const allCards: Card[] | undefined = useTrackerPlugin(
    async (reactivePlugin) => await reactivePlugin.card.getAll()
  );
  return allCards;
}

function getNumberCardsGroupedByRepetitions(allCards) {
  if (!allCards) return [];
  const allCardsWithRepetitionHistory = allCards.filter((card) => card.repetitionHistory !== undefined);
  const repetitionsPerCard = allCardsWithRepetitionHistory.map(
    (card) => card.repetitionHistory.length
  );
  const repetitionsGroupedByNumber = repetitionsPerCard.reduce((r, a) => {
    r[a] = ++r[a] || 1;
    return r;
  }, Object.create(Object));
  const data = Object.keys(repetitionsGroupedByNumber || {}).map((key) => {
    return {x: Number(key), y: repetitionsGroupedByNumber[key]};
  });
  return data;
}

function getRepetitionsPerDayObject (allCards) {
    if (!allCards) return [];
    const repetitionHistory = allCards.map((card) => card.repetitionHistory);
    var repetitionHistoryDates = repetitionHistory.map((repetition) => repetition?.map((repetition) => repetition.date));
    repetitionHistoryDates = repetitionHistoryDates.flat();
    repetitionHistoryDates = repetitionHistoryDates.sort((a,b ) => a -b);;
    repetitionHistoryDates = repetitionHistoryDates.map((date) => new Date(date));
    repetitionHistoryDates = repetitionHistoryDates.filter((date) => !isNaN(date.getTime()));
    const repetitionHistoryDatesFlatSortedDatesGroupedByDay = repetitionHistoryDates.reduce((r, a) => {
      r[a.toDateString()] = ++r[a.toDateString()] || 1;
      return r;
    }, Object.create(Object));
    const repetitionHistoryDatesFlatSortedDatesGroupedByDayUnix = Object.keys(repetitionHistoryDatesFlatSortedDatesGroupedByDay ||{}).map((key) => {
      return {
        date: new Date(key).getTime(),
        repetitions: repetitionHistoryDatesFlatSortedDatesGroupedByDay[key]
      }
    });
    return repetitionHistoryDatesFlatSortedDatesGroupedByDayUnix;
} 

renderWidget(Statistics);