import { usePlugin, renderWidget, useTrackerPlugin, Card, CardNamespace, PluginRem, useRunAsync } from '@remnote/plugin-sdk';
import Chart from 'react-apexcharts';

const DEFAULT_heatmapColorLow = '#b3dff0';
const DEFAULT_heatmapColorNormal = '#3362f0';

var heatmapColorLow: string;
var heatmapColorNormal: string;
var heatmapLowUpperBound: number;
const LIMIT = 1483225200000; // 1.1.2017 (unix timestamp in ms ex)

export const Heatmap = () => {
  const plugin = usePlugin();
  
  var allRemsInContext;
  var allCardsInContext;
  var context = useTrackerPlugin (() => plugin.settings.getSetting('statistics-context'));
  heatmapColorLow = useTrackerPlugin(() => plugin.settings.getSetting('HeatmapColorLow'));
  heatmapColorNormal = useTrackerPlugin(() => plugin.settings.getSetting('HeatmapColorNormal'));
  heatmapLowUpperBound = useTrackerPlugin(() => plugin.settings.getSetting('HeatmapLowUpperBound'));
  //check if heatmapColorLow and heatmapColorNormal are valid colors, if not set them to default values
  if (!/^#[0-9A-F]{6}$/i.test(heatmapColorLow)) {
    heatmapColorLow = DEFAULT_heatmapColorLow;
  }
  if (!/^#[0-9A-F]{6}$/i.test(heatmapColorNormal)) {
    heatmapColorNormal = DEFAULT_heatmapColorNormal;
  }
  var allCards: Card[] | undefined = useTrackerPlugin(
    async (reactivePlugin) => await reactivePlugin.card.getAll()
  );

  /**
   * get the rem id of the widget context
   */
   const contextRemId = useRunAsync(async () => {
    const ctx = await plugin.widget.getWidgetContext<WidgetLocation.Popup>();
    return ctx?.focusedRemId;
  }, []);

  /**
   * get the rem of the contextRemId
   */
  const contextRem = useRunAsync(async () => {
    return await plugin.rem.findOne(contextRemId);
  }, [contextRemId]);
  
  allRemsInContext = useRunAsync(async () => {
    return await contextRem?.getDescendants();
  }, [contextRem]);



  /**
   * get all Cards from allRemsInContext, resolve the promises and store them in allCards
   */
    allCardsInContext = useRunAsync(async () => {
    const result = [];
    for (const rem of allRemsInContext || []) {
      result.push(...(await rem.getCards()));
    }
    return result;
  }, [allRemsInContext]);

  if(context == "Current Rem") allCards = allCardsInContext; 


  const repetitionsPerDay = getRepetitionsPerDayObject(allCards);
  const daysLearned = repetitionsPerDay.length;
  var fullArrayRepetitionsPerDay = getFullArrayRepetitionsPerDay(getRepetitionsPerDayObject(allCards));
  var dailyAverage = getDailyAverage(fullArrayRepetitionsPerDay);
  var longestStreak = getLongestStreak(fullArrayRepetitionsPerDay);
  
    
  /**
   * (TBD): Another heatmap that shows the number of rem updates? per day
   * code to initialize the necessary data: 
   --- start ---
   const allRem: Rem[] | undefined = useTrackerPlugin(
    async (reactivePlugin) => await reactivePlugin.rem.getAll()
  );
    
  const newRemPerDay = getNewRemPerDay(allRem);
  const fullArrayUpdatesPerDay = getFullArrayRepetitionsPerDay(newRemPerDay);
  --- end ---
   * code for return statement: 
    --- start ---
  {renderHeatmap(categorizeDataByWeekday(fullArrayUpdatesPerDay))} 
    --- end ---
  */

    return <div class="heatmapBody">
        <div><b>Context: </b>{context}</div>
        {renderHeatmap(categorizeDataByWeekday(fullArrayRepetitionsPerDay))}
        <p>Days learned: <b>{daysLearned}</b></p>
        <p>Daily average of reviews: <b>{dailyAverage}</b></p>
        <p>Longest streak: <b>{longestStreak}</b> (consecutive days with at least one repetition)</p>
    </div>
}

function categorizeDataByWeekday(data) {
    //create an object where the keys are Monday to Sunday
  //this will be used for the series in the heatmap
  var WeekdaySeries = {"Monday": [], "Tuesday": [], "Wednesday": [], "Thursday": [], "Friday": [], "Saturday": [], "Sunday": []};

  //iterate over the data, determine the weekday based on the Unix timestamp and push the value to the corresponding weekday
  for (var i = 0; i < data.length; i++) {
    var weekday = new Date(data[i][0]).getDay();
    switch (weekday) {
      case 0:
        WeekdaySeries.Sunday.push(data[i]);
        break;
      case 1:
        WeekdaySeries.Monday.push(data[i]);
        break;
      case 2:
        WeekdaySeries.Tuesday.push(data[i]);
        break;
      case 3:
        WeekdaySeries.Wednesday.push(data[i]);
        break;
      case 4:
        WeekdaySeries.Thursday.push(data[i]);
        break;
      case 5:
        WeekdaySeries.Friday.push(data[i]);
        break;
      case 6:
        WeekdaySeries.Saturday.push(data[i]);
        break;
    }
  }
  return WeekdaySeries;
}

/**
 * renders the heatmap
 * @param data 
 * @returns 
 */

function renderHeatmap(WeekdaySeries) {
    const Heatmap = {
        options: {
          xaxis: {
            type: 'datetime'
          },
          title: {
            text: 'Review Heatmap',
          },
          chart: {
            toolbar: {
              show: false
            }
          },
          dataLabels: {
            enabled: false
          },
          legend: {
            show: true,
            customLegendItems: ['Zero', 'Low', 'Normal'],
            markers: {
              fillColors: ['#FFF', heatmapColorLow, heatmapColorNormal]
            }
          },
          colors: [heatmapColorNormal],
          plotOptions: {
            heatmap: {
              shadeIntensity: 0.8,
              colorScale: {
                ranges: [{
                  from: 1,
                  to: heatmapLowUpperBound,
                  name: '< ' + heatmapLowUpperBound,
                  color: heatmapColorLow
                },
                {
                  from: 0,
                  to: 0,
                  name : 'White = Zero',
                  color: '#ffffff'
                }]
              }
            }
          }
        },
        series: [
            {   
                name: "Sunday",
                data: WeekdaySeries.Sunday
            },
            {
                name: "Saturday",
                data: WeekdaySeries.Saturday
            },
            {
                name: "Friday",
                data: WeekdaySeries.Friday
            },
            {
                name: "Thursday",
                data: WeekdaySeries.Thursday
            },
            {
                name: "Wednesday",
                data: WeekdaySeries.Wednesday
            },
            {
                name: "Tuesday",
                data: WeekdaySeries.Tuesday
            },
            {
                name: "Monday",
                data: WeekdaySeries.Monday
            }
        ]
    };
    
    return <div>
    
    <Chart
        options={Heatmap.options}
        series={Heatmap.series}
        type="heatmap"
        width="800"
        height="200"
    />
    </div>
}

/**
 * 
 * @param allCards 
 * @returns an object with the number of repetitions per day
 */
function getRepetitionsPerDayObject (allCards) {
  

    const repetitionHistory = allCards?.map((card) => card.repetitionHistory);
  
    var repetitionHistoryDates = repetitionHistory?.map((repetition) => repetition?.map((repetition) => repetition.date));
  
    //flatten the repetitionHistoryDates array
    repetitionHistoryDates = repetitionHistoryDates?.flat();
  
    //sort dates in ascending order
    repetitionHistoryDates = repetitionHistoryDates?.sort((a,b ) => a -b);;
  
    //convert repetitionHistoryDatesFlatSorted into an array of dates
    repetitionHistoryDates = repetitionHistoryDates?.map((date) => new Date(date));
  
    //remove all NaN values from repetitionHistoryDatesFlatSortedDates
    repetitionHistoryDates = repetitionHistoryDates?.filter((date) => !isNaN(date.getTime()));

    //remove all dates before the limit
    repetitionHistoryDates = repetitionHistoryDates?.filter((date) => date.getTime() > LIMIT);
  
    //group dates by day and count the number of repetitions per day
    const repetitionHistoryDatesFlatSortedDatesGroupedByDay = repetitionHistoryDates?.reduce((r, a) => {
      r[a.toDateString()] = ++r[a.toDateString()] || 1;
      return r;
    }, Object.create(Object));
  
    //convert repetitionHistoryDatesFlatSortedDatesGroupedByDay's keys into Unix timestamps and store them in an object
    const repetitionHistoryDatesFlatSortedDatesGroupedByDayUnix = Object.keys(repetitionHistoryDatesFlatSortedDatesGroupedByDay ||{}).map((key) => {
      return {
        date: new Date(key).getTime(),
        n: repetitionHistoryDatesFlatSortedDatesGroupedByDay[key]
      }
    });
   
    //return Object.entries(repetitionHistoryDatesFlatSortedDatesGroupedByDay || {});
    return repetitionHistoryDatesFlatSortedDatesGroupedByDayUnix;
} 

/**
 * 
 * @param allRem 
 * @returns an object with the number of rem updates per day
 * format: [{date: 123456789, n: 1}, {date: 123456789, n: 1}] 
 */
function getNewRemPerDay(allRem) {
  //reduce the the object to an array of the property updatedAt
  const remDates = allRem?.map((rem) => rem.updatedAt);
  //convert the array of dates into an array of Unix timestamps
  const remDatesUnix = remDates?.map((date) => new Date(date).toDateString());
  
  //group the dates by day and count the number of repetitions per day
  const remDatesGroupedByDay = remDatesUnix?.reduce((r, a) => {
    r[a] = ++r[a] || 1;
    return r;
  }, Object.create(Object));

  //convert remDatesGroupedByDay's keys into Unix timestamps and store them in an object
  const remDatesGroupedByDayUnix = Object.keys(remDatesGroupedByDay ||{}).map((key) => {
    return {
      date: new Date(key).getTime(),
      n: remDatesGroupedByDay[key]
    }
  });

  //remove entries where date is NaN
  const remDatesGroupedByDayUnixFiltered = remDatesGroupedByDayUnix?.filter((entry) => !isNaN(entry.date));

  //sort the array by date
  remDatesGroupedByDayUnixFiltered?.sort((a,b) => a.date - b.date);



  return remDatesGroupedByDayUnixFiltered
}
  
  /**
   * 
   * @returns Array[][]
   * Format: [UnixTimespamp,nRepetitions] 
   */
function getFullArrayRepetitionsPerDay(data) {
    //var data = getRepetitionsPerDayObject(allCards);
  
    
    //sort data by date in ascending order
    var dataSorted = data?.sort((a,b) => a.date - b.date);

  
    //get the first and last date
    var firstDate = dataSorted.at(0)?.date;
    var lastDate = dataSorted.at(-1)?.date;
  
    //create an object with with all days between firstDate and lastDate in the format of Unix timestamps
    var allDays = {};
    for (var d = new Date(firstDate); d <= new Date(lastDate); d.setDate(d.getDate() + 1)) {
      allDays[d.getTime()] = 0;
    }
  
    //iterate over dataSorted and add the repetitions to allDays
    dataSorted?.forEach((item) => {
      allDays[item.date] = item.n;
    });
  
    
  
    return Object.keys(allDays).map((key) => [Number(key), allDays[key]]);
}


/**
 * 
 * @param data (FullArrayRepetitionsPerDay)
 * @returns number (longest streak in days)
 */
function getLongestStreak(data) {
  var streak = 0;
  var longestStreak = 0;
  for (var i = 0; i < data.length; i++) {
    if (data[i][1] > 0) {
      streak++;
    } else {
      if (streak > longestStreak) {
        longestStreak = streak;
      }
      streak = 0;
    }
  }
  return longestStreak;
  
}

/**
 * 
 * @param data (FullArrayRepetitionsPerDay)
 * @returns number (daily average)
 */
function getDailyAverage(data) {
  var sum = 0;
  for (var i = 0; i < data.length; i++) {
    sum += data[i][1];
  }
  return Math.round(sum / data.length);
}



renderWidget(Heatmap);