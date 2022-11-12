import { usePlugin, renderWidget, useTracker, Card, CardNamespace, Rem, useRunAsync, WidgetLocation } from '@remnote/plugin-sdk';
import Chart from 'react-apexcharts';

/* Constants */
var chartColor = '#3362f0';

/* Functions */
export const Statistics = () => {
  const plugin = usePlugin();
  var allCards;
  var allRemsInContext;
  var allCardsInContext;
  var daysOutlook: Number = 30;

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
    //check if contextRem is of type Rem
    console.log("contextRem", contextRem);
    return await contextRem?.getDescendants();
  }, [contextRem]);



  /**
   * get all Cards from allRemsInContext, resolve the promises and store them in allCards
   */
  allCards = useRunAsync(async () => {
    const result = [];
    for (const rem of allRemsInContext || []) {
      result.push(...(await rem.getCards()));
    }
    return result;
  }, [allRemsInContext]);
  

  

  //resolve Promise of x
  //console.log(allCards);




  daysOutlook = useTracker(() => plugin.settings.getSetting('statistics-nDays-outlook'));

  //check if color setting is a valid hex color (not case sensitive)
  const chartColorSettings = useTracker(() => plugin.settings.getSetting('statistics-chart-color'));
  if(/^#[0-9A-F]{6}$/i.test(chartColorSettings)) {
    chartColor = chartColorSettings;
  }

  return <div style={{ maxHeight: "calc(90vh)" }} class="statisticsBody overflow-y-auto">
    <div><b>Context: </b> {contextRem?.text}</div>
    <div><b>Retention rate: </b> {(retentionRate(getNumberRepetitionsGroupedByScore(allCards)))}</div>
    <div class="vSpacing-1rem"/>
    {chart_column(
      transformObjectToCategoryFormat(getNumberRepetitionsGroupedByScore(allCards)), 
      'category', 
      'Buttons pressed', 
      daysOutlook)}
    

    {chart_column(
      getFutureDueCards(allCards, daysOutlook), 
      'datetime', 
      'Number of cards due in within the next ' + daysOutlook + ' days', 
      daysOutlook)}

    {chart_column(
      getNumberCardsGroupedByRepetitions(allCards), 
      'category', 
      'Number of cards grouped by number of reviews')}

    {chart_repetionsCompounded(allCards)}
    
    
  </div>;

}

function getAllCardsInContext(contextRem : Rem | undefined) {
  console.log("getAllCardsInContext");
  return contextRem?.getDescendants();
}

/**
 * 
 * @param days number of days to look into the future
 * @returns Unix timestamp for for the time in x days
 */
function getFutureUnixTimestamp(days: number) {
  return new Date().getTime() + days * 24 * 60 * 60 * 1000;
}

/**
 * 
 * @param allCards 
 * @param daysOutlook (Number of days to look into the future)
 * @returns a two dimensional array with the number of cards due in the next x days [[date (unix timestamp), number of cards], ...]
 */
function getFutureDueCards(allCards, daysOutlook: Number) {
  
  var futureDueCards =  allCards?.filter((card) => card.nextRepetitionTime > Date.now());

  var futureDueDates = futureDueCards?.map((card) => new Date(card.nextRepetitionTime));


  //group dates by day and count the number of repetitions per day
  const futureDueDatesGroupedByDay = futureDueDates?.reduce((r, a) => {
    r[a.toDateString()] = ++r[a.toDateString()] || 1;
    return r;
  }, Object.create(Object));

  const data = Object.keys(futureDueDatesGroupedByDay ||{}).map((key) => {
    return [Date.parse(key), futureDueDatesGroupedByDay[key]];
  });

  //sort the data
  data.sort((a,b) => a[0] - b[0]);

  //get the unix timestamps for the start of this day
  const today = new Date();
  today.setHours(0,0,0,0);
  const todayUnix = Number(today.getTime());

  //get a array with unix timestamps for the next x days and a value of 0
  const futureDueDatesGroupedByDayUnix = Array.from({length: daysOutlook}, (v, i) => [todayUnix + i * 24 * 60 * 60 * 1000, 0]);


  
  for(let i = 0; i < data.length; i++) {
    for(let j = 0; j < futureDueDatesGroupedByDayUnix.length; j++) {
      if(data[i][0] === futureDueDatesGroupedByDayUnix[j][0]) {
        futureDueDatesGroupedByDayUnix[j][1] = data[i][1];
      }
    }
  }

    
  return futureDueDatesGroupedByDayUnix;

}

/**
 * Renders a column chart with the given data
 * @param data 
 * @param xaxisType 
 * @param title 
 * @param xMax 
 * @returns 
 */
function chart_column(data: any[][], xaxisType: String, title: String, xMax?: number) {
  const chart = {
    options: {
      dataLabels: {
        enabled: false
      },
      title: {
        text: title,
      },
      colors: chartColor,
      xaxis: {
        type: xaxisType,
        tickAmount: 'dataPoints',
        max: {xMax},
        labels: {
          show: true
        }
      },
      yaxis: {
        decimalsInFloat: 0,
      },
    },
    series: [{
      name: '',
      data: data
    }]
  }

  return <div><div></div>
  <Chart
    options={chart.options}
    type="bar"
    width="600"
    height="200"
    series={chart.series}/></div>;
}

function getNumberRepetitionsGroupedByScore(allCards) {
  console.log(allCards);
  var data = {"Skip": 0, "Forgot": 0, "Partially recalled": 0, "Recalled with effort": 0, "Easily recalled": 0};
  for(let a in allCards) {
    
    for(let r in allCards[a].repetitionHistory) {
      let score = allCards[a].repetitionHistory[r].score;
      switch(score) {
        case 0: data["Skip"]++; break;
        case 0.01: data["Forgot"]++; break;
        case 0.5: data["Partially recalled"]++; break;
        case 1: data["Recalled with effort"]++; break;
        case 1.5: data["Easily recalled"]++; break;

    }
  }
  }

  return data;
}

/**
 * Usefull for transforming an object to a format that can be used for a chart with a category x-axis
 * @param data {a:b, c:d, e:f}
 * @returns [{x:a, y:b}, {x:c, y:d}, {x:e, y:f}]
 */
function transformObjectToCategoryFormat(data) {
  //convert to format [{x: "Skip", y: 0}, ...]
  return Object.keys(data).map((key) => {
    return {x: key, y: data[key]};
  });
}


function retentionRate(data) {
  console.log(data);
  var a = data["Forgot"] + data["Partially recalled"];
  var b = data["Recalled with effort"] + data["Easily recalled"];

  return (b/(a+b)).toFixed(2);
}

/**
 * 
 * @returns a line chart with the compounded number of repetitions in total
 */
function chart_repetionsCompounded(allCards) {
  var data = getRepetitionsPerDayObject(allCards);
  //sort the data by date
  data = data?.sort((a,b) => a.date - b.date);

  


  //convert data into an array 
  var series = Object.keys(data).map((key) => [data[key]['date'], data[key]['repetitions']]);

  for(var i = 1; i < series.length; i++) {
    series[i][1] = series[i][1] + series[i-1][1];
  }

  const chart = {
    options: {
      xaxis: {
        type: 'datetime',
        tickPlacement: 'on',
      },
      title: {
        text: 'Sum of reviews over time'
      },
      dataLabels: {
        enabled: false
      },
      stroke: {
        colors: chartColor,
        curve: 'smooth'
      },
      chart: {
        zoom: {
          enabled: true,
          type: 'xy',
          autoScaleYaxis: true
        }
      },
      fill: {
        type: 'solid',
        colors: chartColor
      },
      tooltip: {
        enabled: true,
        x: {
          format: 'dd MM yyyy'
        }
      }
    },
    series: [{
      data: series
    }]
  }

  return <div><Chart
    options={chart.options}
    series={chart.series}
    type="area"
  /></div>
}

/**
 * 
 * @returns all cards in the database
 */
function getAllCards() {
  const allCards: Card[] | undefined = useTracker(
    async (reactivePlugin) => await reactivePlugin.card.getAll()
  );
  return allCards;
}

/**
 * @returns an array of objects with the format [{x: number of repetitions, y: number of cards}, {...}, ...]
 */
function getNumberCardsGroupedByRepetitions(allCards) {
  

  //remove all cards where repetitionHistory is undefined
  const allCardsWithRepetitionHistory = allCards?.filter((card) => card.repetitionHistory !== undefined);

  //get the number of repetitions for each card
  const repetitionsPerCard = allCardsWithRepetitionHistory?.map(
    (card) => card.repetitionHistory?.length
    );
  
  //group the number of repetitions by the number of repetitions
  const repetitionsGroupedByNumber = repetitionsPerCard?.reduce((r, a) => {
    r[a] = ++r[a] || 1;
    return r;
  }, Object.create(Object));

  //convert the object into an array of objects with the format {x: number of repetitions, y: number of cards}
  const data = Object.keys(repetitionsGroupedByNumber || {}).map((key) => {
    return {x: Number(key), y: repetitionsGroupedByNumber[key]};
  });


  return data;
}


/**
 * 
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
  
  
    //group dates by day and count the number of repetitions per day
    const repetitionHistoryDatesFlatSortedDatesGroupedByDay = repetitionHistoryDates?.reduce((r, a) => {
      r[a.toDateString()] = ++r[a.toDateString()] || 1;
      return r;
    }, Object.create(Object));
  
    //convert repetitionHistoryDatesFlatSortedDatesGroupedByDay's keys into Unix timestamps and store them in an object
    const repetitionHistoryDatesFlatSortedDatesGroupedByDayUnix = Object.keys(repetitionHistoryDatesFlatSortedDatesGroupedByDay ||{}).map((key) => {
      return {
        date: new Date(key).getTime(),
        repetitions: repetitionHistoryDatesFlatSortedDatesGroupedByDay[key]
      }
    });
   
    //return Object.entries(repetitionHistoryDatesFlatSortedDatesGroupedByDay || {});
    return repetitionHistoryDatesFlatSortedDatesGroupedByDayUnix;
  } 


renderWidget(Statistics);
