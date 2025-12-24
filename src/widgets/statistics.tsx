import { usePlugin, renderWidget, useTrackerPlugin, Card, useRunAsync, WidgetLocation } from '@remnote/plugin-sdk';
import Chart from 'react-apexcharts';
import React from 'react';

/* Constants */
var chartColor = '#3362f0';

/* Functions */
export const Statistics = () => {
  const plugin = usePlugin();
  
  // -- State Management --
  const [contextMode, setContextMode] = React.useState<'Global' | 'Current'>('Global');
  const [dateStart, setDateStart] = React.useState<string>('');
  const [dateEnd, setDateEnd] = React.useState<string>('');
  const [dueOutlook, setDueOutlook] = React.useState<number>(30); // Default Month

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
  
  // -- 4. MONOLITHIC FETCH: Descendants + Cards --
  // We combine these to ensure we don't have dependency race conditions
  const allCardsInContext = useRunAsync(async () => {
    if (!contextRem) {
      console.log("Stats Plugin: Context Rem not ready yet.");
      return undefined; // Return undefined to signal 'loading'
    }

    console.log(`Stats Plugin: Fetching descendants for ${contextRem._id}...`);
    const descendants = await contextRem.getDescendants();
    
    // Include the context Rem itself + all descendants
    const allRems = [contextRem, ...descendants];
    console.log(`Stats Plugin: Found ${allRems.length} Rems in context (Self + Descendants).`);

    const resultCards: Card[] = [];
    
    // Batch fetching cards
    // Optimization: Parallelize fetching to speed up loading
    await Promise.all(allRems.map(async (rem) => {
      const cards = await rem.getCards();
      if (cards && cards.length > 0) {
        resultCards.push(...cards);
      }
    }));

    console.log(`Stats Plugin: Found ${resultCards.length} total cards in context.`);
    return resultCards;
  }, [contextRem]);

  // -- Filtering Logic --
  
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

  
  // -- Settings / Styles --
  const chartColorSettings = useTrackerPlugin(() => plugin.settings.getSetting('statistics-chart-color'));
  if(chartColorSettings && /^#[0-9A-F]{6}$/i.test(chartColorSettings)) {
    chartColor = chartColorSettings;
  }

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

  return <div style={{ ...containerStyle, maxHeight: "calc(90vh)" }} className="statisticsBody overflow-y-auto">
    
    {/* --- CONTROLS SECTION --- */}
    <div className="mb-6 p-4 border rounded-md" style={boxStyle}>
      
      {/* Context Selector */}
      <div className="mb-4">
        <h4 className="font-bold mb-2">Context</h4>
        <div className="flex gap-4">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input 
              type="radio" 
              checked={contextMode === 'Global'} 
              onChange={() => setContextMode('Global')}
              className="form-radio text-blue-600"
              style={{ accentColor: chartColor }}
            />
            <span>Global</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input 
              type="radio" 
              checked={contextMode === 'Current'} 
              onChange={() => setContextMode('Current')}
              className="form-radio text-blue-600"
              style={{ accentColor: chartColor }}
            />
            <span>{contextMode === 'Current' ? contextRemName : "Current Rem"}</span>
          </label>
        </div>
      </div>

      {/* Date Period Selector */}
      <div>
        <h4 className="font-bold mb-2">Period</h4>
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex flex-col">
            <span className="text-xs" style={{ color: 'var(--rn-clr-content-secondary)' }}>From</span>
            <input 
              type="date" 
              value={dateStart} 
              onChange={(e) => setDateStart(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
              style={inputStyle}
            />
          </div>
          <div className="flex flex-col">
            <span className="text-xs" style={{ color: 'var(--rn-clr-content-secondary)' }}>To</span>
            <input 
              type="date" 
              value={dateEnd} 
              onChange={(e) => setDateEnd(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
              style={inputStyle}
            />
          </div>
          <button 
            onClick={() => {setDateStart(''); setDateEnd('');}}
            className="text-xs hover:underline mt-4"
            style={{ color: chartColor }}
          >
            Clear
          </button>
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
        <div className="mb-2"><b>Retention rate: </b> {(retentionRate(buttonsPressedDataObj))}</div>
        
        <div className="vSpacing-1rem"/>

        {/* 2. Buttons Pressed */}
        {chart_column_with_percent(
          buttonsPressedData, 
          'category', 
          'Buttons pressed',
          buttonsPressedTotal
        )}
        
        {/* 3. Due Cards */}
        <div className="mt-8 mb-2">
          <div className="flex justify-between items-center mb-2">
            <div className="font-bold text-lg">Due Cards Outlook</div>
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

        {/* 4. Reviews Count */}
        {chart_column(
          getNumberCardsGroupedByRepetitions(filteredCards), 
          'category', 
          'Number of cards grouped by number of reviews')}

        {/* 5. Compounded Reviews */}
        {chart_repetionsCompounded(filteredCards)}
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
      borderColor: 'var(--rn-clr-border-primary)'
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