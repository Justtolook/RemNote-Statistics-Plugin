import { usePlugin, renderWidget, useTracker, Card, CardNamespace, Rem, useRunAsync } from '@remnote/plugin-sdk';
import Chart from 'react-apexcharts';

/* Constants */

/* Functions */
export const Statistics = () => {
    const plugin = usePlugin();
    const allCards = getAllCards();


    return <div>
      <div>Statistics</div>
      <div>Future Due: {JSON.stringify(getFutureDueCards(allCards))}</div>
      {chart_column(getFutureDueCards(allCards))}
    </div>;
}

function getFutureDueCards(allCards) {
  const daysOutlook = 30;
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

  //get a array with unix timestamps for the next 30 days and a value of 0
  const futureDueDatesGroupedByDayUnix = Array.from({length: daysOutlook}, (v, i) => [todayUnix + i * 24 * 60 * 60 * 1000, 0]);

  for(let i = 0; i < data.length; i++) {
    for(let j = 0; j < futureDueDatesGroupedByDayUnix.length; j++) {
      if(data[i][0] === futureDueDatesGroupedByDayUnix[j][0]) {
        futureDueDatesGroupedByDayUnix[j][1] = data[i][1];
      }
    }
  }

    
  return data;

}

function chart_column(data: any[][]) {
  const chart = {
    options: {
      chart: {
        type: 'bar'
      },
      dataLabels: {
        enabled: false
      },
      xaxis: {
        type: 'datetime',
        max: new Date().getTime() + 30 * 24 * 60 * 60 * 1000,
      },
    },
    series: [{
      name: 'Cards Due',
      data: data
    }]
  }

  return <div><div>Due in future:</div>
  <Chart
    options={chart.options}
    type="bar"
    width="600"
    height="200"
    series={chart.series}/></div>;
}

function chart_repetionsCompounded() {
  var data = getRepetitionsPerDayObject();
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
        tickPlacement: 'on'
      },
      dataLabels: {
        enabled: false
      },
      chart: {
        zoom: {
          enabled: true,
          type: 'xy',
          autoScaleYaxis: true
        }
      },
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 1,
          opacityTo: 0.5,
          stops: [0, 90]
        }
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

  return <div><div>Sum of repetitions over time</div><Chart
    options={chart.options}
    series={chart.series}
    type="area"
  /></div>
}

function getAllCards() {
  const allCards: Card[] | undefined = useTracker(
    async (reactivePlugin) => await reactivePlugin.card.getAll()
  );
  return allCards;
}

function getRepetitionsPerDayObject () {
  
    const repetitionHistory = getAllCards()?.map((card) => card.repetitionHistory);
  
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