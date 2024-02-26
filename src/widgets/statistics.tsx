import { usePlugin, renderWidget, useTracker, Card, CardNamespace, Rem, useRunAsync, WidgetLocation } from '@remnote/plugin-sdk';
import React, { useState, useMemo } from 'react';
import * as d3 from "d3";
import { LineChart, Line, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar, ComposedChart, Area } from 'recharts';
import DatePicker, { registerLocale, setDefaultLocale }  from 'react-datepicker';
import de from 'date-fns/locale/de';
registerLocale('de', de)
setDefaultLocale('de')
//import 'react-datepicker/dist/react-datepicker.css';


/* Constants */
var chartColor = '#3362f0';


/* Functions */
export const Statistics = () => {
  const plugin = usePlugin();
  var allCards;
  var allRemsInContext;
  var allCardsInContext;
  var daysOutlook: Number = 30;
  var daysPast: Number = -10;
  var context = useTracker (() => plugin.settings.getSetting('statistics-context'));
  const [startDate, setStartDate] = useState(new Date(Date.now() - 60 * 24 * 60 * 60 * 1000));
  const [endDate, setEndDate] = useState(new Date());
  const [showRepetitions, setShowRepetitions] = useState(true);
  const [showMovingAverage, setShowMovingAverage] = useState(true);
  const [showAccumulatedRepetitions, setShowAccumulatedRepetitions] = useState(true);


  allCards = getAllCards();

  //convert allCards into an array of objects
  //const allCardsArray = Object.keys(allCards || {}).map((key) => allCards[key]);

  //console.log(allCardsArray);



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


  const repetitionsObject = getRepetitionsObject(allCards);
  const repetitionsPerDay = getRepetitionsPerDay(repetitionsObject);

  daysOutlook = useTracker(() => plugin.settings.getSetting('statistics-nDays-outlook'));
  daysPast = useTracker(() => plugin.settings.getSetting('statistics-nDays-past'));

  //check if color setting is a valid hex color (not case sensitive)
  const chartColorSettings = useTracker(() => plugin.settings.getSetting('statistics-chart-color'));
  if(/^#[0-9A-F]{6}$/i.test(chartColorSettings)) {
    chartColor = chartColorSettings;
  }

  //getFutureDueCardsGroupedByDayAndScore(allCards, daysOutlook);





  /**
   * filter the repetitionsPerDay by the date range
   */
  const filteredData = useMemo(() => {
    if (!startDate || !endDate) {
      return repetitionsPerDay;
    }
    //check if repetitionsPerDay is undefined
    if(repetitionsPerDay === undefined) return [];
    return repetitionsPerDay.filter((item) => {
      const itemDate = new Date(item.date);
      return itemDate >= startDate && itemDate <= endDate;
    });
  }, [startDate, endDate, allCards]);
  console.log(filteredData);

  /*
  const filteredData = useMemo(() => {
    if (!startDate || !endDate) {
      return getRepetitionsPerDayObject(allCards);
    }
  
    return getRepetitionsPerDayObject(allCards).filter((item) => {
      const itemDate = new Date(item.date);
      return itemDate >= startDate && itemDate <= endDate;
    });
  }, [startDate, endDate, allCards]);
  */

  /**
   * Calculate the moving average of the data with a window of 7 days and add it to the data
   * @param data 
   * @returns data with a moving average
   */
  const calculateMovingAverage = (data) => {
    const window = 7;
    const movingAverage = [];

    for (let i = 0; i < data?.length; i++) {
      if (i < window) {
        const sum = data.slice(0, i + 1).reduce((acc, item) => acc + item.repetitions, 0);
        movingAverage.push({
          date: data[i].date,
          repetitions: data[i].repetitions,
          movingAverage: Math.round(sum / (i + 1))
        });
        continue;
      }

      const sum = data.slice(i - window, i).reduce((acc, item) => acc + item.repetitions, 0);
      movingAverage.push({
        date: data[i].date,
        repetitions: data[i].repetitions,
        movingAverage: Math.round(sum / window)
      });
    }

    return movingAverage;
  }

  const calculateAccumulatedRepetitions = (data) => {
    const accumulatedRepetitions = [];

    for (let i = 0; i < data.length; i++) {
      if (i === 0) {
        accumulatedRepetitions.push({
          date: data[i].date,
          repetitions: data[i].repetitions,
          accumulatedRepetitions: data[i].repetitions
        });
        continue;
      }

      accumulatedRepetitions.push({
        date: data[i].date,
        repetitions: data[i].repetitions,
        accumulatedRepetitions: data[i].repetitions + accumulatedRepetitions[i - 1].accumulatedRepetitions
      });
    }

    return accumulatedRepetitions;
  }


  const dataWithMovingAverage = calculateMovingAverage(filteredData);
  
  //join accumulatedRepetitions with the dataWithMovingAverage Object
  const dataObject = dataWithMovingAverage.map((item, index) => {
    return {
      ...item,
      accumulatedRepetitions: calculateAccumulatedRepetitions(filteredData)[index].accumulatedRepetitions
    }
  });

  const renderRepetitionsGroupedByScore = () => {

    const data = transformObjectToCategoryFormat(getNumberRepetitionsGroupedByScore(allCards)).map(({ x: score, y: repetitions }) => ({ score, repetitions }));
    
    return (
      <BarChart
        width={500}
        height={300}
        data={data}
        margin={{
          top: 5,
          right: 30,
          left: 20,
          bottom: 5,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="score" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="repetitions" fill="#8884d8" />
      </BarChart>
    )
  }

  /**
   * render a recharts stacked bar chart with the number of repetitions per day and score 
   * use repetitionsPerDay as input
   */
  const renderRepetitionsByDayAndScore = () => {
    //console.time("renderRepetitionsByDayAndScore");
    const data = filteredData;
    console.log("score data: ", data);
    //console.timeEnd("renderRepetitionsByDayAndScore");
    return (
      <ComposedChart
        width={500}
        height={300}
        data={data}
        margin={{
          top: 5,
          right: 30,
          left: 20,
          bottom: 5,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" scale="time" type="number" domain={['auto', 'auto']} tickFormatter={(unixTime) => d3.timeFormat('%Y-%m-%d')(new Date(unixTime))} />
        <YAxis />
        <Tooltip labelFormatter={(unixTime) => d3.timeFormat('%Y-%m-%d')(new Date(unixTime))}/>
        <Legend />
        <Bar type="monotone" dataKey="scoreForgot" stackId="a" stroke="#ff7300" fill="#ff7300" />
        <Bar type="monotone" dataKey="scoreSkip" stackId="a" stroke="#8884d8" fill="#8884d8" />
        <Bar type="monotone" dataKey="scorePartiallyRecalled" stackId="a" stroke="#82ca9d" fill="#82ca9d" />
        <Bar type="monotone" dataKey="scoreRecalledWithEffort" stackId="a" stroke="#ffc658" fill="#ffc658" />
        <Bar type="monotone" dataKey="scoreEasilyRecalled" stackId="a" stroke="#77aa88" fill="#77aa88" />
      </ComposedChart>
    )
  }

    
  /**
   * render a recharts bar chart with the average response time per day
   * use repetitionsPerDay as input
   */
  const renderResponseTime = () => {
    const data = filteredData;
    return (
      <BarChart
        width={500}
        height={300}
        data={data}
        margin={{
          top: 5,
          right: 30,
          left: 20,
          bottom: 5,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" scale="time" type="number" domain={['auto', 'auto']} tickFormatter={(unixTime) => d3.timeFormat('%Y-%m-%d')(new Date(unixTime))} />
        <YAxis unit="s"/>
        <Tooltip labelFormatter={(unixTime) => d3.timeFormat('%Y-%m-%d')(new Date(unixTime))}/>
        <Legend />
        <Bar type="monotone" dataKey="avgResponseTime" fill="#ff7300" dot={false} unit="s"/>
      </BarChart>
    )
  }

  const renderSumResponseTime = () => {
    const data = filteredData;
    return (
      <BarChart
        width={500}
        height={300}
        data={data}
        margin={{
          top: 5,
          right: 30,
          left: 20,
          bottom: 5,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" scale="time" type="number" domain={['auto', 'auto']} tickFormatter={(unixTime) => d3.timeFormat('%Y-%m-%d')(new Date(unixTime))} />
        <YAxis unit="m"/>
        <Tooltip labelFormatter={(unixTime) => d3.timeFormat('%Y-%m-%d')(new Date(unixTime))}/>
        <Legend />
        <Bar type="monotone" dataKey="sumResponseTime" fill="#ff7300" unit="m"/>
      </BarChart>
    )
  }



  return (
    <div style={{ maxHeight: "calc(90vh)" }} className="statisticsBody overflow-y-auto">
      <div><b>Context: </b> {context}</div>
      <div><b>Retention rate: </b> {(retentionRate(getNumberRepetitionsGroupedByScore(allCards)))}</div>
      <div className="vSpacing-1rem"/>

      <DatePicker locale="de" selected={startDate} onChange={date => setStartDate(date)} />
      <DatePicker locale="de" selected={endDate} onChange={date => setEndDate(date)} />

      <div className="vSpacing-1rem"/>

      <label>
      <input type="checkbox" checked={showRepetitions} onChange={(e) => setShowRepetitions(e.target.checked)} />
      Show Repetitions
      </label>

      <label>
        <input type="checkbox" checked={showMovingAverage} onChange={(e) => setShowMovingAverage(e.target.checked)} />
        Show Moving Average
      </label>

      <label>
        <input type="checkbox" checked={showAccumulatedRepetitions} onChange={(e) => setShowAccumulatedRepetitions(e.target.checked)} />
        Show Accumulated Repetitions
      </label>

      
      <ComposedChart 
        width={500}
        height={300}
        data={dataObject}
        margin={{
          top: 5,
          right: 30,
          left: 20,
          bottom: 5,
        }}
        >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" scale="time" type="number" domain={['auto', 'auto']} tickFormatter={(unixTime) => d3.timeFormat('%Y-%m-%d')(new Date(unixTime))} />
        <YAxis />
        <Tooltip labelFormatter={(unixTime) => d3.timeFormat('%Y-%m-%d')(new Date(unixTime))}/>
        <Legend />
        {showAccumulatedRepetitions && <Area type="monotone" dataKey="accumulatedRepetitions" stroke="#77aa88" fill="#dddddd" />}
        {showRepetitions && <Bar dataKey="repetitions" fill="#8884d8" />}
        {showMovingAverage && <Line type="monotone" dataKey="movingAverage" stroke="#ff7300" dot={false}/>}

        <div className="vSpacing-1rem"/>

        </ComposedChart >

        {renderSumResponseTime()}

        {renderResponseTime()}
        
        {renderRepetitionsByDayAndScore()}

        {renderRepetitionsGroupedByScore()}
  
    </div>
  );

}



function getAllCardsInContext(contextRem : Rem | undefined) {
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
 * count the number of cards due in the next x days per day and group them by the last score (use getNumberRepetitionsGroupedByScore()). The output should be ready to be used by chart_column_stacked()
 * @param allCards
 * @param daysOutlook
 */
/*function getFutureDueCardsGroupedByDayAndScore(allCards, daysPast: Number, daysOutlook: Number) {
  //console.time("getFutureDueCardsGroupedByDayAndScore");
  let unixPast = getFutureUnixTimestamp(daysPast); 
  var cards =  allCards?.filter((card) => card.nextRepetitionTime > unixPast);

  //create a new array with the format [[date (unix timestamp), score], ...]
  var futureDueCardsWithScore = cards?.map((card) => [new Date(card.nextRepetitionTime), card.repetitionHistory[card.repetitionHistory.length - 1].score]);

  
  //group futureDueCardsWithScore by score
  const futureDueCardsWithScoreGroupedByScore = futureDueCardsWithScore?.reduce((r, a) => {
    r[a[1]] = ++r[a[1]] || 1;
    return r;
  }, Object.create(Object));

  //for each score, group the dates by day and count the number of repetitions per day
  const futureDueCardsWithScoreGroupedByScoreGroupedByDay = Object.keys(futureDueCardsWithScoreGroupedByScore || {}).map((key) => {
    return {
      score: key,
      data: futureDueCardsWithScore?.filter((card) => card[1] === Number(key)).reduce((r, a) => {
        r[a[0].toDateString()] = ++r[a[0].toDateString()] || 1;
        return r;
      }, Object.create(Object))
    }
  });

  //convert futureDueCardsWithScoreGroupedByScoreGroupedByDay's keys into Unix timestamps and store them in an object
  const data = futureDueCardsWithScoreGroupedByScoreGroupedByDay.map((scoreGroup) => {
    return {
      score: scoreGroup.score,
      data: Object.keys(scoreGroup.data ||{}).map((key) => {
        return {
          date: new Date(key).getTime(),
          repetitions: scoreGroup.data[key]
        }
      })
    }
  });

  //sort the data by date
  data.forEach((scoreGroup) => {
    scoreGroup.data.sort((a,b) => a.date - b.date);
  });

  //get the unix timestamps for the start of this day
  const today = new Date();
  today.setHours(0,0,0,0);
  const todayUnix = Number(today.getTime());

  //bring the data on an equal timeline
  data.forEach((scoreGroup) => {
    //get a array with unix timestamps for the next x days and a value of 0
    const futureDueDatesGroupedByDayUnix = createUnixTimeSeries(daysPast, daysOutlook).map((day) => [day, 0]);



    
    for(let i = 0; i < scoreGroup.data.length; i++) {
      for(let j = 0; j < futureDueDatesGroupedByDayUnix.length; j++) {
        if(scoreGroup.data[i].date === futureDueDatesGroupedByDayUnix[j][0]) {
          futureDueDatesGroupedByDayUnix[j][1] = scoreGroup.data[i].repetitions;
        }
      }
    }
    


    scoreGroup.data = futureDueDatesGroupedByDayUnix;
  });  

  //convert data i.e. [score, [number of repetitions day 0, ...]]
  data.forEach((scoreGroup) => {
    scoreGroup.data = scoreGroup.data.map((day) => day[1]);
  });

  //rename score e.g., 0.01 -> Skip
  data.forEach((scoreGroup) => {
    switch(scoreGroup.score) {
      case '0': scoreGroup.score = "Forgot"; break;
      case '0.01': scoreGroup.score = "Skip"; break;
      case '0.5': scoreGroup.score = "Partially recalled"; break;
      case '1': scoreGroup.score = "Recalled with effort"; break;
      case '1.5': scoreGroup.score = "Easily recalled"; break;
    }
  });
  
  //console.timeEnd("getFutureDueCardsGroupedByDayAndScore");
  return data;
}*/


/*function getFutureDueCardsGroupedByDayAndScore2(allCards, daysPast: Number, daysOutlook: Number) {
  let unixPast = getFutureUnixTimestamp(daysPast); 
  var cards =  allCards?.filter((card) => card.nextRepetitionTime > unixPast);

  //create a new array with the format [[date (unix timestamp), score], ...]
  var futureDueCardsWithScore = cards?.map((card) => [new Date(card.nextRepetitionTime), card.repetitionHistory[card.repetitionHistory.length - 1].score]);

  //create a new blank object with the format {scoreName, [date, number of repetitions], ...}
  var dataGrouped: any[] = [
    {score: "Forgot", data: []},
    {score: "Skip", data: []},
    {score: "Partially recalled", data: []},
    {score: "Recalled with effort", data: []},
    {score: "Easily recalled", data: []}
  ];

  //get a array with unix timestamps for the next x days and a value of 0
  const timeSeries = createUnixTimeSeries(daysPast, daysOutlook).map((day) => [day, 0]);

  //copy the timeSeries into each data object
  dataGrouped.forEach((scoreGroup) => {
    scoreGroup.data = timeSeries;
  });

  //iterate over the last repetition of all cards and add the number of repetitions to the corresponding data object and day
  futureDueCardsWithScore?.forEach((card) => {
    switch(card[1]) {
      case '0': dataGrouped[0].data.forEach((day) => {if(day[0] === card[0].getTime()) day[1]++}); break;
      case '0.01': dataGrouped[1].data.forEach((day) => {if(day[0] === card[0].getTime()) day[1]++}); break;
      case '0.5': dataGrouped[2].data.forEach((day) => {if(day[0] === card[0].getTime()) day[1]++}); break;
      case '1': dataGrouped[3].data.forEach((day) => {if(day[0] === card[0].getTime()) day[1]++}); break;
      case '1.5': dataGrouped[4].data.forEach((day) => {if(day[0] === card[0].getTime()) day[1]++}); break;
    }
  }
  );

  return dataGrouped;
}*/


/**
 * create an unix time series from start to end with a day as an interval stored in an array
 * @param start (days relative to today)
 * @param end (days relative to today)
 */
function createUnixTimeSeries(start: Number, end: Number) {
  console.time("createUnixTimeSeries");
  const today = new Date();
  today.setHours(0,0,0,0);
  const todayUnix = Number(today.getTime());

  //get a array with unix timestamps for the next x days
  const futureDueDatesGroupedByDayUnix = Array.from({length: end - start}, (v, i) => todayUnix + (i + start) * 24 * 60 * 60 * 1000);
  console.timeEnd("createUnixTimeSeries");
  return futureDueDatesGroupedByDayUnix;
}





function getNumberRepetitionsGroupedByScore(allCards) {
  var data = {"Skip": 0, "Forgot": 0, "Partially recalled": 0, "Recalled with effort": 0, "Easily recalled": 0};
  for(let a in allCards) {
    
    for(let r in allCards[a].repetitionHistory) {
      let score = allCards[a].repetitionHistory[r].score;
      switch(score) {
        case 0: data["Forgot"]++; break;
        case 0.01: data["Skip"]++; break;
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

function getRepetitionsObject(Cards) {
  console.time("repetitionsObject");
  //create an array with _id and repetitionHistory
  var data = Cards?.map((card) => {
    return {
      _id: card._id, 
      repetitionHistory: card.repetitionHistory};
  });



  //remove all cards where repetitionHistory is undefined
  data = data?.filter((card) => card.repetitionHistory !== undefined);

  //delete the unnecessary property from each repetitionHistory object
  data = data?.map((card) => {
    return {
      repetitionHistory: card.repetitionHistory?.map((repetition) => {
        const { scheduler, isCram, metadata, schedulerMetadata, lazyLoad, subQueueId, ...rest } = repetition;
        //add the _id to each repetition
        rest._id = card._id;
        return rest;
      })
    }
  });
  //console.log("repetitionsObject: ", data);

  //flatten to the repetitionHistory array
  data = data?.map((card) => card.repetitionHistory).flat();
  //console.log("repetitionsObject: ", data);

  console.timeEnd("repetitionsObject");

  return data;
}

/**
 * create an object that groups the repetitions by day
 * it should first normalize the unix-date to the start of each day
 * for each day, it should have property with the date, the number of repetitions and the number of repetitions per score
 * @param repetitionsObject
 * @returns an object with the number of repetitions per day
 */
function getRepetitionsPerDay(repetitionsObject) {
  //convert the date into a Unix timestamp
  if(repetitionsObject === undefined) return [];
  repetitionsObject = repetitionsObject?.map((repetition) => {
    repetition.date = new Date(repetition.date).setHours(0,0,0,0);
    return repetition;
  });

  //sort the repetitionsObject by date
  repetitionsObject = repetitionsObject?.sort((a,b) => a.date - b.date);

  //get the earliest date
  const earliestDate = repetitionsObject[0]?.date;

  //create an array with all dates from the earliest date to today

  const timeSeries = d3.timeDay.range(new Date(earliestDate), new Date());

  //check for missing dates from the timeSeries in repetitionsObject and add them with a value of 0
  const repetitionsObjectDates = repetitionsObject?.map((repetition) => repetition.date);
  timeSeries?.forEach((date) => {
    if(!repetitionsObjectDates.includes(date.getTime())) {
      repetitionsObject.push({
        date: date.getTime(), 
        repetitions: 0, 
        responseTime: 0,
        revealTime: 0,
        scoreSkip: 0,
        scoreForgot: 0,
        scorePartiallyRecalled: 0,
        scoreRecalledWithEffort: 0,
        scoreEasilyRecalled: 0,
        score: {
          0: 0,
          0.01: 0,
          0.5: 0,
          1: 0,
          1.5: 0
        }});
    }
  });

  console.log("repetionsObject: ", repetitionsObject);


  //sort the repetitionsObject by date
  repetitionsObject = repetitionsObject?.sort((a,b) => a.date - b.date);

  //rollup over repetitionsObject and group repetitions by date and add the following properties for each date:
  // sum of repetitions, sum of repetitions per score, average response time
  const dataObject = repetitionsObject?.reduce((acc, curr) => {
    if (!acc[curr.date]) {
      acc[curr.date] = {
        date: curr.date,
        repetitions: 0,
        scoreSkip: 0,
        scoreForgot: 0,
        scorePartiallyRecalled: 0,
        scoreRecalledWithEffort: 0,
        scoreEasilyRecalled: 0,
        score: {
          0: 0,
          0.01: 0,
          0.5: 0,
          1: 0,
          1.5: 0
        },
        sumResponseTime: 0,
        sumRevealTime: 0,
        avgResponseTime: 0,
        avgRevealTime: 0
        //count: 0
      };
    }
  
    acc[curr.date].repetitions += 1;
    acc[curr.date].sumResponseTime += curr.responseTime;
    acc[curr.date].sumRevealTime += curr.revealTime;
    //acc[curr.date].count += 1;
  
    /*
    if (!acc[curr.date].score[curr.score]) {
      acc[curr.date].score[curr.score] = 0;
    }
    */
  
    acc[curr.date].score[curr.score] += 1;

    switch(curr.score) {
      case 0: acc[curr.date].scoreForgot += 1; break;
      case 0.01: acc[curr.date].scoreSkip += 1; break;
      case 0.5: acc[curr.date].scorePartiallyRecalled += 1; break;
      case 1: acc[curr.date].scoreRecalledWithEffort += 1; break;
      case 1.5: acc[curr.date].scoreEasilyRecalled += 1; break;
    }
  
    return acc;
  }, {});

  
  for (const key in dataObject) {
    //calculate the average response and reveal time
    dataObject[key].avgResponseTime = Math.round(dataObject[key].sumResponseTime / (dataObject[key].repetitions * 1000));
    dataObject[key].avgRevealTime = Math.round(dataObject[key].sumRevealTime / (dataObject[key].repetitions * 1000));

    //convert ms to minutes of sum of response and reveal time
    dataObject[key].sumResponseTime = Math.round(dataObject[key].sumResponseTime / 60000);
    dataObject[key].sumRevealTime = Math.round(dataObject[key].sumRevealTime / 60000);

  }


  if(dataObject === undefined) return [];
  const data = Object.values(dataObject);








  console.log("repetitionsPerDay: ", data);
  return data;
}



/**
 * 
 * @returns an object with the number of repetitions per day
 */
function getRepetitionsPerDayObject (allCards) {
    const repetitionHistory = allCards?.map((card) => card.repetitionHistory);
  
    var repetitionHistoryDates = repetitionHistory?.map((repetition) => repetition?.map((repetition) => repetition.date));
    //console.log("repetitionHistoryDates: ", repetitionHistoryDates);
  
    //flatten the repetitionHistoryDates array
    repetitionHistoryDates = repetitionHistoryDates?.flat();
    //console.log("repetitionHistoryDatesFlat: ", repetitionHistoryDates);
  
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

    const dateObject = Object.keys(repetitionHistoryDatesFlatSortedDatesGroupedByDay ||{}).map((key) => {
      return {
        date: key,
        repetitions: repetitionHistoryDatesFlatSortedDatesGroupedByDay[key]
      }
    });

    //get the earliest date
    const earliestDate = dateObject.at(0)?.date;

    //create an array with all dates from the earliest date to today
    const timeSeries = d3.timeDay.range(new Date(earliestDate), new Date());
    
    //create an object with with date and repetitions for each day 
    const timeSeriesObject = timeSeries.map((date) => {
      return {
        date: date.getTime(),
        repetitions: repetitionHistoryDatesFlatSortedDatesGroupedByDay[date.toDateString()] || 0
      }
    });

    //console.log(timeSeriesObject);
    return timeSeriesObject;




   


    

   


  
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
