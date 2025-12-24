import { usePlugin, renderWidget, useTrackerPlugin, Card, useRunAsync } from '@remnote/plugin-sdk';
import Chart from 'react-apexcharts';
import React from 'react';

const DEFAULT_heatmapColorLow = '#b3dff0';
const DEFAULT_heatmapColorNormal = '#3362f0';
const LIMIT = 1483225200000; // 1.1.2017 (unix timestamp)

export const Heatmap = () => {
  const plugin = usePlugin();
  
  // -- State Management --
  const [contextMode, setContextMode] = React.useState<'Global' | 'Current'>('Global');

  // -- 1. Fetch Settings --
  const colorLowSetting = useTrackerPlugin(() => plugin.settings.getSetting('HeatmapColorLow'));
  const colorNormalSetting = useTrackerPlugin(() => plugin.settings.getSetting('HeatmapColorNormal'));
  const lowerBoundSetting = useTrackerPlugin(() => plugin.settings.getSetting('HeatmapLowUpperBound'));

  const heatmapColorLow = (colorLowSetting && /^#[0-9A-F]{6}$/i.test(colorLowSetting as string)) 
    ? colorLowSetting as string 
    : DEFAULT_heatmapColorLow;

  const heatmapColorNormal = (colorNormalSetting && /^#[0-9A-F]{6}$/i.test(colorNormalSetting as string)) 
    ? colorNormalSetting as string 
    : DEFAULT_heatmapColorNormal;
    
  const heatmapLowUpperBound = typeof lowerBoundSetting === 'number' ? lowerBoundSetting : 30;

  // -- 2. Context Logic (Session Storage) --
  const sessionContext = useTrackerPlugin(async (reactivePlugin) => {
    return await reactivePlugin.storage.getSession<{focusedRemId: string}>('statistics-context');
  }, []);

  const contextRemId = sessionContext?.focusedRemId;

  // -- 3. Context Rem Resolution --
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
  const allGlobalCards = useTrackerPlugin(async (reactivePlugin) => await reactivePlugin.card.getAll());

  const allCardsInContext = useRunAsync(async () => {
    if (!contextRem) return undefined;
    const descendants = await contextRem.getDescendants();
    const allRems = [contextRem, ...descendants];
    const result: Card[] = [];
    await Promise.all(allRems.map(async (r) => {
        const cards = await r.getCards();
        if(cards) result.push(...cards);
    }));
    return result;
  }, [contextRem]);

  // -- 5. Select Data Source --
  const activeCards = (contextMode === 'Current') ? allCardsInContext : allGlobalCards;
  
  // Loading check
  const isLoading = (contextMode === 'Current' && !activeCards) || (contextMode === 'Global' && !allGlobalCards);

  // -- 6. Process Data --
  const repetitionsPerDay = React.useMemo(() => {
     return getRepetitionsPerDayObject(activeCards || []);
  }, [activeCards]);

  const fullArrayRepetitionsPerDay = React.useMemo(() => {
     return getFullArrayRepetitionsPerDay(repetitionsPerDay);
  }, [repetitionsPerDay]);

  const daysLearned = repetitionsPerDay.length;
  const dailyAverage = getDailyAverage(fullArrayRepetitionsPerDay);
  const longestStreak = getLongestStreak(fullArrayRepetitionsPerDay);

  // -- Styles --
  const containerStyle = { color: 'var(--rn-clr-content-primary)' };
  const boxStyle = { 
    backgroundColor: 'var(--rn-clr-background-secondary)', 
    borderColor: 'var(--rn-clr-border-primary)',
    color: 'var(--rn-clr-content-primary)' 
  };

  return <div className="heatmapBody overflow-y-auto" style={containerStyle}>
      
      {/* Controls */}
      <div className="mb-6 p-4 border rounded-md" style={boxStyle}>
        <div className="mb-2">
          <h4 className="font-bold mb-2">Context</h4>
          <div className="flex gap-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input 
                type="radio" 
                checked={contextMode === 'Global'} 
                onChange={() => setContextMode('Global')}
                className="form-radio text-blue-600"
                style={{ accentColor: heatmapColorNormal }}
              />
              <span>Global</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input 
                type="radio" 
                checked={contextMode === 'Current'} 
                onChange={() => setContextMode('Current')}
                className="form-radio text-blue-600"
                style={{ accentColor: heatmapColorNormal }}
              />
              <span>{contextMode === 'Current' ? contextRemName : "Current Rem"}</span>
            </label>
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
              categorizeDataByWeekday(fullArrayRepetitionsPerDay), 
              heatmapColorLow, 
              heatmapColorNormal, 
              heatmapLowUpperBound
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

/**
 * Organizes data into Series (Rows) for the heatmap.
 * CRITICAL FIX: Normalizes X-values to the 'Week Start' so days stack vertically.
 */
function categorizeDataByWeekday(data) {
  var WeekdaySeries = {
    "Monday": [] as any[], "Tuesday": [] as any[], "Wednesday": [] as any[], 
    "Thursday": [] as any[], "Friday": [] as any[], "Saturday": [] as any[], "Sunday": [] as any[]
  };

  for (var i = 0; i < data.length; i++) {
    const dateObj = new Date(data[i].x);
    const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 1 = Monday...
    
    // NORMALIZE X: Set X to the Sunday of that week to align columns
    const diff = dateObj.getDate() - dayOfWeek; 
    const weekStart = new Date(dateObj.setDate(diff));
    weekStart.setHours(0,0,0,0);
    
    const dataPoint = {
        x: weekStart.getTime(), // Common X for the whole week
        y: data[i].y            // Value for the specific day
    };

    switch (dayOfWeek) {
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

function renderHeatmap(WeekdaySeries, colorLow, colorNormal, lowerBound) {
    const options = {
          xaxis: {
            type: 'datetime' as const,
            labels: { style: { colors: 'var(--rn-clr-content-primary)' } },
            tooltip: { enabled: false }
          },
          chart: {
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
            markers: {
              fillColors: ['var(--rn-clr-background-tertiary)', colorLow, colorNormal]
            }
          },
          colors: [colorNormal],
          plotOptions: {
            heatmap: {
              shadeIntensity: 0.5,
              radius: 2,
              useFillColorAsStroke: false,
              colorScale: {
                ranges: [{
                  from: 1,
                  to: lowerBound,
                  name: 'Low',
                  color: colorLow
                },
                {
                  from: lowerBound + 1,
                  to: 1000000,
                  name: 'High',
                  color: colorNormal
                },
                {
                  from: 0,
                  to: 0,
                  name : 'Zero',
                  color: 'var(--rn-clr-background-tertiary)' 
                }]
              }
            }
          },
          stroke: {
            width: 1,
            colors: ['var(--rn-clr-background-primary)']
          },
          tooltip: { 
             theme: 'light',
             x: { show: false }, // Hide week-start date in tooltip to avoid confusion
             y: {
                 formatter: function(val) {
                     return val + " reviews";
                 }
             }
          }
    };
    
    // Order determines rendering from top to bottom
    const series = [
            { name: "Sat", data: WeekdaySeries.Saturday },
            { name: "Fri", data: WeekdaySeries.Friday },
            { name: "Thu", data: WeekdaySeries.Thursday },
            { name: "Wed", data: WeekdaySeries.Wednesday },
            { name: "Tue", data: WeekdaySeries.Tuesday },
            { name: "Mon", data: WeekdaySeries.Monday },
            { name: "Sun", data: WeekdaySeries.Sunday },
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

function getRepetitionsPerDayObject (allCards) {
    if (!allCards || allCards.length === 0) return [];

    const repetitionHistory = allCards.map((card) => card.repetitionHistory);
    var repetitionHistoryDates = repetitionHistory
        .filter(h => h !== undefined)
        .map((repetition) => repetition.map((r) => r.date))
        .flat()
        .sort((a,b) => a - b)
        .map((date) => new Date(date))
        .filter((date) => !isNaN(date.getTime()) && date.getTime() > LIMIT);
  
    const grouped = repetitionHistoryDates.reduce((r, a) => {
      r[a.toDateString()] = ++r[a.toDateString()] || 1;
      return r;
    }, Object.create(null));
  
    return Object.keys(grouped).map((key) => {
      return {
        date: new Date(key).getTime(),
        n: grouped[key]
      }
    });
} 

function getFullArrayRepetitionsPerDay(data) {
    if (!data || data.length === 0) return [];
    
    var dataSorted = [...data].sort((a,b) => a.date - b.date);

    var firstDate = dataSorted[0].date;
    var lastDate = dataSorted[dataSorted.length - 1].date;
  
    var allDays = {};
    for (var d = new Date(firstDate); d <= new Date(lastDate); d.setDate(d.getDate() + 1)) {
      allDays[d.getTime()] = 0;
    }
  
    dataSorted.forEach((item) => {
      allDays[item.date] = item.n;
    });
  
    // Return explicit {x, y} objects for ApexCharts
    return Object.keys(allDays).map((key) => ({
        x: Number(key), 
        y: allDays[key]
    }));
}

function getLongestStreak(data) {
  if (!data || data.length === 0) return 0;
  var streak = 0;
  var longestStreak = 0;
  for (var i = 0; i < data.length; i++) {
    if (data[i].y > 0) { // Note: accessing .y property now
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
    sum += data[i].y; // Note: accessing .y property now
  }
  return Math.round(sum / data.length);
}

renderWidget(Heatmap);