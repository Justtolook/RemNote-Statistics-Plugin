import { usePlugin, renderWidget, useTrackerPlugin, Card, useRunAsync } from '@remnote/plugin-sdk';
import Chart from 'react-apexcharts';
import React from 'react';

const DEFAULT_heatmapColorLow = '#b3dff0';
const DEFAULT_heatmapColorHigh = '#1302d1';
const LIMIT = 1483225200000; // 1.1.2017 (unix timestamp)

export const Heatmap = () => {
  const plugin = usePlugin();
  
  // -- State Management --
  const [contextMode, setContextMode] = React.useState<'Global' | 'Current'>('Global');
  
  // Initialize with Current Year
  const today = new Date();
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  
  // UPDATED: Added 'Last Year' to state type
  const [rangeMode, setRangeMode] = React.useState<'Week' | 'Month' | 'Year' | 'Last Year' | 'All'>('Year');
  const [dateStart, setDateStart] = React.useState<string>(startOfYear.toISOString().split('T')[0]);
  const [dateEnd, setDateEnd] = React.useState<string>(today.toISOString().split('T')[0]);

  // -- 1. Fetch Settings --
  const colorLowSetting = useTrackerPlugin(() => plugin.settings.getSetting('HeatmapColorLow'));
  const colorHighSetting = useTrackerPlugin(() => plugin.settings.getSetting('HeatmapColorHigh'));
  const lowerBoundSetting = useTrackerPlugin(() => plugin.settings.getSetting('HeatmapTarget'));

  const heatmapColorLow = (colorLowSetting && /^#[0-9A-F]{6}$/i.test(colorLowSetting as string)) 
    ? colorLowSetting as string 
    : DEFAULT_heatmapColorLow;

  const heatmapColorHigh = (colorHighSetting && /^#[0-9A-F]{6}$/i.test(colorHighSetting as string)) 
    ? colorHighSetting as string 
    : DEFAULT_heatmapColorHigh;
    
  const heatmapTarget = (lowerBoundSetting !== undefined && lowerBoundSetting !== null)
    ? Number(lowerBoundSetting) 
    : 30;

  // -- 2. Calculate Medium Category --
  // Midpoint is half of the upper bound (e.g. if bound is 30, midpoint is 15)
  const heatmapMidPoint = Math.max(1, Math.round(heatmapTarget / 2));
  
  // Create intermediate color
  const heatmapColorMedium = React.useMemo(() => {
    return interpolateColor(heatmapColorLow, heatmapColorHigh, 0.5);
  }, [heatmapColorLow, heatmapColorHigh]);

  // -- 3. Context Logic --
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
     const text = await plugin.richText.toString(contextRem.text);
     return text && text.trim().length > 0 ? text : "Untitled Rem";
  }, [contextRem, contextRemId]);

  // -- 4. Data Fetching --
  const allGlobalCards = useRunAsync(async () => {
    console.log("Heatmap: Fetching all global cards...");
    const cards = await plugin.card.getAll();
    console.log(`Heatmap: Fetched ${cards?.length || 0} global cards.`);
    return cards;
  }, []);

  const allCardsInContext = useRunAsync(async () => {
    if (!contextRem) return undefined;
    console.log(`Heatmap: Fetching context cards for ${contextRem._id}...`);
    const descendants = await contextRem.getDescendants();
    const allRems = [contextRem, ...descendants];
    const result: Card[] = [];
    await Promise.all(allRems.map(async (r) => {
        const cards = await r.getCards();
        if(cards) result.push(...cards);
    }));
    console.log(`Heatmap: Fetched ${result.length} context cards.`);
    return result;
  }, [contextRem]);

  // -- 5. Select Data Source --
  const activeCards = (contextMode === 'Current') ? allCardsInContext : allGlobalCards;
  const isLoading = (contextMode === 'Current' && !activeCards) || (contextMode === 'Global' && !allGlobalCards);

  // -- 6. Process & Filter Data --
  const handleRangeChange = (mode: 'Week' | 'Month' | 'Year' | 'Last Year' | 'All') => {
    setRangeMode(mode);
    const t = new Date();
    
    // Default End Date is today
    let end = new Date();
    let start = new Date();

    if (mode === 'Week') {
      start.setDate(t.getDate() - 7);
    } else if (mode === 'Month') {
      start.setDate(t.getDate() - 30);
    } else if (mode === 'Year') {
      start.setDate(t.getDate() - 365);
    } else if (mode === 'Last Year') {
      // Previous Calendar Year (e.g. Jan 1 to Dec 31 of last year)
      start = new Date(t.getFullYear() - 1, 0, 1); // Jan 1st prev year
      end = new Date(t.getFullYear() - 1, 11, 31); // Dec 31st prev year
    } else {
      // All Time
      setDateStart('');
      setDateEnd('');
      return;
    }

    setDateStart(start.toISOString().split('T')[0]);
    setDateEnd(end.toISOString().split('T')[0]);
  };

  const filteredData = React.useMemo(() => {
    if (!activeCards) return [];
    const startTs = dateStart ? new Date(dateStart).getTime() : 0;
    const endTs = dateEnd ? new Date(dateEnd).getTime() + (24 * 60 * 60 * 1000) : Infinity;

    return getRepetitionsPerDayOptimized(activeCards, startTs, endTs);
  }, [activeCards, dateStart, dateEnd]);

  const daysLearned = filteredData.filter(d => d.y > 0).length;
  const dailyAverage = getDailyAverage(filteredData);
  const longestStreak = getLongestStreak(filteredData);

  // -- Styles --
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

  return <div className="heatmapBody overflow-y-auto" style={containerStyle}>
      
      {/* Controls Container */}
      <div className="mb-6 p-4 border rounded-md flex flex-col md:flex-row gap-6" style={boxStyle}>
        
        {/* Left Column: Context */}
        <div className="flex-1 border-r border-gray-200 dark:border-gray-700 pr-4">
          <h4 className="font-bold mb-2 text-sm uppercase tracking-wide opacity-70">Context</h4>
          <div className="flex flex-col gap-2">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input 
                type="radio" 
                checked={contextMode === 'Global'} 
                onChange={() => setContextMode('Global')}
                className="form-radio"
                style={{ accentColor: '#3362f0' }}
              />
              <span>Global</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input 
                type="radio" 
                checked={contextMode === 'Current'} 
                onChange={() => setContextMode('Current')}
                className="form-radio"
                style={{ accentColor: '#3362f0' }}
              />
              <span className="truncate" title={contextMode === 'Current' ? contextRemName : "Current Rem"}>
                {contextMode === 'Current' ? contextRemName : "Current Rem"}
              </span>
            </label>
          </div>
        </div>

        {/* Right Column: Period Selection */}
        <div className="flex-[2] flex flex-col gap-3">
          
          {/* Top Row: Preset Buttons */}
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm uppercase tracking-wide opacity-70">Period</h4>
            <div className="flex gap-1 text-xs bg-opacity-50 p-1 rounded" style={{ backgroundColor: 'var(--rn-clr-background-primary)' }}>
              {['Week', 'Month', 'Year', 'Last Year', 'All'].map((m) => (
                <button
                  key={m}
                  onClick={() => handleRangeChange(m as any)}
                  className={`px-3 py-1 rounded transition-colors`}
                  style={rangeMode === m 
                    ? { backgroundColor: '#3362f0', color: '#fff' }
                    : { color: 'var(--rn-clr-content-secondary)' }
                  }
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Bottom Row: Date Inputs */}
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col">
              <span className="text-xs opacity-70 mb-1">Start Date</span>
              <input 
                type="date" 
                value={dateStart} 
                onChange={(e) => { setDateStart(e.target.value); setRangeMode('All'); }}
                className="border rounded px-2 py-1 text-sm w-36"
                style={inputStyle}
              />
            </div>
            <div className="flex flex-col">
              <span className="text-xs opacity-70 mb-1">End Date</span>
              <input 
                type="date" 
                value={dateEnd} 
                onChange={(e) => { setDateEnd(e.target.value); setRangeMode('All'); }}
                className="border rounded px-2 py-1 text-sm w-36"
                style={inputStyle}
              />
            </div>
            {(dateStart || dateEnd) && (
               <button 
                 onClick={() => handleRangeChange('All')}
                 className="text-xs hover:underline mb-2 ml-auto"
                 style={{ color: '#3362f0' }}
               >
                 Clear Filter
               </button>
            )}
          </div>
        </div>

      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center items-center h-40">
          <div className="text-lg opacity-60">Loading heatmap data...</div>
        </div>
      ) : (
        <>
          {renderHeatmap(
              categorizeDataByWeekday(filteredData), 
              heatmapColorLow, 
              heatmapColorMedium, 
              heatmapColorHigh, 
              heatmapMidPoint,
              heatmapTarget
          )}
          
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div className="p-2 border rounded" style={{ borderColor: 'var(--rn-clr-border-primary)' }}>
              <div className="text-sm opacity-70">Days learned</div>
              <div className="text-xl font-bold">{daysLearned}</div>
            </div>
            <div className="p-2 border rounded" style={{ borderColor: 'var(--rn-clr-border-primary)' }}>
              <div className="text-sm opacity-70">Daily Average</div>
              <div className="text-xl font-bold">{isNaN(dailyAverage) ? 0 : dailyAverage}</div>
            </div>
            <div className="p-2 border rounded" style={{ borderColor: 'var(--rn-clr-border-primary)' }}>
              <div className="text-sm opacity-70">Longest Streak</div>
              <div className="text-xl font-bold">{longestStreak}</div>
            </div>
          </div>
        </>
      )}
    </div>
}

// --- Helper Functions ---

/** * Interpolates between two hex colors.
 * Factor 0.5 returns the midpoint color.
 */
function interpolateColor(color1: string, color2: string, factor: number = 0.5): string {
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

function getRepetitionsPerDayOptimized(allCards: Card[], startLimit: number, endLimit: number) {
  console.log(`Heatmap: Processing ${allCards.length} cards...`);
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

  const result: {x: number, y: number}[] = [];
  const current = new Date(finalStart);
  const end = new Date(finalEnd);
  current.setHours(0,0,0,0);
  
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

function categorizeDataByWeekday(data) {
  var WeekdaySeries = {
    "Monday": [] as any[], "Tuesday": [] as any[], "Wednesday": [] as any[], 
    "Thursday": [] as any[], "Friday": [] as any[], "Saturday": [] as any[], "Sunday": [] as any[]
  };

  for (var i = 0; i < data.length; i++) {
    const dataPoint = data[i];
    var weekday = new Date(dataPoint.x).getDay();

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

function renderHeatmap(WeekdaySeries, colorLow, colorMedium, colorHigh, midPoint, lowerBound) {
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
            // Removed manual 'markers' to allow ApexCharts to sync legend colors with ranges
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
                 formatter: function(val) {
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

function getLongestStreak(data) {
  if (!data || data.length === 0) return 0;
  var streak = 0;
  var longestStreak = 0;
  for (var i = 0; i < data.length; i++) {
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

function getDailyAverage(data) {
  if (!data || data.length === 0) return 0;
  var sum = 0;
  for (var i = 0; i < data.length; i++) {
    sum += data[i].y;
  }
  return Math.round(sum / data.length);
}

renderWidget(Heatmap);