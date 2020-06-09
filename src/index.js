import React from "react";
import ReactDOM from "react-dom"
import PropTypes from "prop-types";

import moment from "moment-timezone";
import { RRule, RRuleSet } from "rrule";

import "./index.css";

import Event from "./event";
import MultiEvent from './multiEvent';

const EventWrapper = React.forwardRef((props, ref) => {
  return (<Event innerRef={ref} {...props} />);
});

const MultiEventWrapper = React.forwardRef((props, ref) => {
  return (<MultiEvent innerRef={ref} {...props} />);
});

export default class Calendar extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      monthNames: [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ],
      days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      today: moment(),
      current: moment().startOf("month").utc(true), //current position on calendar (first day of month)
      events: [],//all day or multi day events
      singleEvents: [], //single day events
      calendarTimezone: "",
      useCalendarTimezone: this.props.useCalendarTimezone,
      calendarId: this.props.calendarId,
      apiKey: this.props.apiKey,
      
      //calendar colors
      borderColor: this.props.borderColor,
      textColor: this.props.textColor,
      backgroundColor: this.props.backgroundColor,
      todayTextColor: this.props.todayTextColor,
      todayBackgroundColor: this.props.todayBackgroundColor,

      //tooltip colors
      tooltipBorderColor: this.props.tooltipBorderColor,
      tooltipTextColor: this.props.tooltipTextColor,

      //single event colors
      singleEventHoverColor: this.props.singleEventHoverColor,
      singleEventTextColor: this.props.singleEventTextColor,
      singleEventCircleColor: this.props.singleEventCircleColor,

      //long event colors
      eventTextColor: this.props.eventTextColor,
      eventBackgroundColor: this.props.eventBackgroundColor,
      eventHoverColor: this.props.eventHoverColor,
    };

    this.calendarRef = React.createRef();

    this.lastMonth = this.lastMonth.bind(this);
    this.nextMonth = this.nextMonth.bind(this);
  }

  async componentDidMount() {
    //init and load google calendar api
    try {
      const res = await Calendar.loadCalendarAPI(this.state.apiKey);
      console.log(res);
    } catch(err) {
      console.error("Error loading GAPI client for API", err);
    }

    //Get events
    try {
      //query api for events
      const res = await Calendar.getEvents(this.state.calendarId);

      //process events
      const events = Calendar.processEvents(res.result.items, this.state.useCalendarTimezone);
      
      //get timezone
      const timezone = Calendar.getTimezone(res.result.timeZone, this.state.useCalendarTimezone);

      //set state with calculated values
      this.setState({"calendarTimezone": timezone, "events": events[0], "singleEvents": events[1]});

    } catch(err) {
      console.error("Error getting events", err);
    }
  }

  //add in events after rendering calendar
  componentDidUpdate() {
    this.clearEvents();
    this.renderEvents();
  }

  static loadCalendarAPI(apiKey) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://apis.google.com/js/api.js";
      document.body.appendChild(script);
      script.onload = () => {
        gapi.load("client", () => {
          gapi.client.init({ apiKey: apiKey })
            .then(() => {
              gapi.client
                .load(
                  "https://content.googleapis.com/discovery/v1/apis/calendar/v3/rest"
                )
                .then(
                  () => resolve("GAPI client successfully loaded for API"),
                  (err) => reject(err)
                );
            });
        });
      }
    })
  }

  //query calendar API for events
  static getEvents(calendarId, maxResults = 1000) {
    return gapi.client.calendar.events.list({
      calendarId: calendarId,
      maxResults: maxResults,
    });
  }

  //get timezone from response object based on useCalendarTimezone
  static getTimezone(timezone, useCalendarTimezone) {
    if (useCalendarTimezone) {
      return timezone;
    } else {
      return moment.tz.guess();
    }
  }

  //get easy to work with events and singleEvents from response
  static processEvents(items, useCalendarTimezone) {
    let singleEvents = [];
    let events = [];
    let changed = [];
    let cancelled = [];

    items.forEach((event) => {
      if (event.originalStartTime) { //cancelled events
        if (event.status == "cancelled") {
          cancelled.push({
            recurringEventId: event.recurringEventId,
            originalStartTime: useCalendarTimezone ? moment.parseZone(event.originalStartTime.dateTime || event.originalStartTime.date) : moment(event.originalStartTime.dateTime || event.originalStartTime.date), 
          });
        } else if (event.status == "confirmed") { //changed events
          changed.push({
            recurringEventId: event.recurringEventId,
            name: event.summary,
            description: event.description,
            location: event.location,
            originalStartTime: useCalendarTimezone ? moment.parseZone(event.originalStartTime.dateTime || event.originalStartTime.date) : moment(event.originalStartTime.dateTime || event.originalStartTime.date),
            newStartTime: useCalendarTimezone ? moment.parseZone(event.start.dateTime || event.start.date) : moment(event.start.dateTime || event.start.date),
            newEndTime: useCalendarTimezone ? moment.parseZone(event.end.dateTime || event.end.date) : moment(event.end.dateTime || event.end.date),
          });
        } else {
          console.log("Not categorized: ", event);
        }
      } else if (event.status == "confirmed") { //normal events
        let newEvent = {
          id: event.id,
          name: event.summary,
          startTime: useCalendarTimezone ? moment.parseZone(event.start.dateTime || event.start.date) : moment(event.start.dateTime || event.start.date), //read date if datetime doesn"t exist
          endTime: useCalendarTimezone ? moment.parseZone(event.end.dateTime || event.end.date) : moment(event.end.dateTime || event.end.date),
          description: event.description,
          location: event.location,
          recurrence: event.recurrence,
          changedEvents: [],
          cancelledEvents: [],
        };

        //use same way of distinguishing between singleEvents and longer events as google calendar
        //duration is at least 24 hours or ends after 12pm on the next day
        if (moment.duration(newEvent.endTime.diff(newEvent.startTime)).asHours() >= 24 || (!newEvent.startTime.isSame(newEvent.endTime, 'day') && newEvent.endTime.hour() >= 12)) {
          events.push(newEvent);
        } else {
          singleEvents.push(newEvent);
        }
      } else {
        console.log("Not categorized: ", newEvent);
      }
    });

    //add changed events and cancelled events to corresponding event object
    events.forEach((event, idx, arr) => {
      if (event.recurrence) {
        //push changed events
        changed.filter(change => change.recurringEventId == event.id).forEach((change) => {
          arr[idx].changedEvents.push(change);
        });

        //push cancelled events
        cancelled.filter(cancel => cancel.recurringEventId == event.id).forEach((cancel) => {
          arr[idx].cancelledEvents.push(cancel.originalStartTime);
        });
      }
    });

    singleEvents.forEach((event, idx, arr) => {
      if (event.recurrence) {
        //push changed events
        changed.filter(change => change.recurringEventId == event.id).forEach((change) => {
          arr[idx].changedEvents.push(change);
        });

        //push cancelled events
        cancelled.filter(cancel => cancel.recurringEventId == event.id).forEach((cancel) => {
          arr[idx].cancelledEvents.push(cancel.originalStartTime);
        });
      }
    });

    return [events, singleEvents];
  }

  //sets current month to previous month
  lastMonth() {
    this.setState({ current: this.state.current.subtract(1, "months") });
  }

  //sets current month to following month
  nextMonth() {
    this.setState({ current: this.state.current.add(1, "months") });
  }

  clearEvents() {
    for (let i = 1; i <= this.state.current.daysInMonth(); i++) {
      const node = document.getElementById("day-" + i);
      while (node.lastElementChild) {
        node.removeChild(node.lastElementChild);
      }
    }
  }
  
  //renders the day of week names
  renderDays() {
    return this.state.days.map((x, i) => (
      <div
        className="day-name"
        key={"day-of-week-" + i}
        css={{ borderColor: this.state.borderColor }}
      >
        {x}
      </div>
    ));
  }

  //renders the blocks for the days of each month
  renderDates() {
    var days = [...Array(this.state.current.daysInMonth() + 1).keys()].slice(1); // create array from 1 to number of days in month

    var dayOfWeek = this.state.current.day(); //get day of week of first day in the month

    var padDays = (((-this.state.current.daysInMonth() - this.state.current.day()) % 7) + 7) % 7; //number of days to fill out the last row    


    return [
      [...Array(dayOfWeek)].map((x, i) => (
        <div
          className="day"
          key={"empty-day-" + i}
          css={{ borderColor: this.state.borderColor }}
        ></div>
      )),
      days.map(x => {
        if (x == this.state.today.date() && this.state.current.isSame(this.state.today, "month")) {
          return (
            <div
              className="day"
              key={"day-" + x}
              css={{ 
                borderColor: this.state.borderColor,
                color: this.state.todayTextColor,
                background: this.state.todayBackgroundColor,
              }}
            >
              <span
                css={{
                  paddingRight: '6px',
                }}
              >
                {x}
              </span>
              <div className="innerDay" id={"day-" + x}></div>
            </div>
          );
        } else {
          return (
            <div
              className="day"
              key={"day-" + x}
              css={{ borderColor: this.state.borderColor }}
            >
              <span
                css={{
                  paddingRight: '6px',
                }}
              >
                {x}
              </span>
              <div className="innerDay" id={"day-" + x}></div>
            </div>
          );
        }
      }),
      [...Array(padDays)].map((x, i) => (
        <div
          className="day"
          key={"empty-day-2-" + i}
          css={{ borderColor: this.state.borderColor }}
        ></div>
      ))
    ];
  }

  //TODO: optimize
  //decides how to render events
  drawMultiEvent(props) { 
    let startDrawDate;
    let blockLength = 1;
    let curDate;
    let endDate;

    let arrowLeft = false;
    let arrowRight = false;

    if (props.endTime.isSame(moment(props.endTime).startOf("day"), "second")) {
      endDate = moment(props.endTime).utc(true).subtract(1, "day");
    } else {
      endDate = moment(props.endTime).utc(true);
    }

    if (props.startTime.isBefore(this.state.current)) {
      arrowLeft = true;
      startDrawDate = 1;
      curDate = moment(this.state.current).utc(true);
    } else {
      startDrawDate = props.startTime.date();
      curDate = moment(props.startTime).utc(true);
    }


    while (curDate.isSameOrBefore(endDate, "day")) {
      if (curDate.date() == this.state.current.daysInMonth() && !endDate.isSame(this.state.current, 'month')) {
        arrowRight = true;
        //draw then quit
        this.renderMultiEventBlock(startDrawDate, blockLength, props, arrowLeft, arrowRight);
        break;
      }
      if (curDate.date() == this.state.current.daysInMonth() || curDate.isSame(endDate, "day")) {
        //draw then quit
        this.renderMultiEventBlock(startDrawDate, blockLength, props, arrowLeft, arrowRight);
        break;
      }
      if (curDate.day() == 6) {
        //draw then reset
        this.renderMultiEventBlock(startDrawDate, blockLength, props, arrowLeft, arrowRight);
        startDrawDate = moment(curDate).add(1, "day").date();
        blockLength = 0;
        arrowLeft = false;
        arrowRight = false;
      }

      blockLength++;
      curDate.add(1, "day");
    }
  }

  //handles rendering and proper stacking of individual blocks 
  renderMultiEventBlock(startDate, length, props, arrowLeft, arrowRight) { 
    let multiEventProps = {
      tooltipBorderColor: this.state.tooltipBorderColor,
      tooltipTextColor: this.state.tooltipTextColor,
      textColor: this.state.eventTextColor,
      backgroundColor: this.state.eventBackgroundColor,
      hoverColor: this.state.eventHoverColor,
    }

    let maxBlocks = 0;
    let closedSlots = []; //keep track of rows that cannot be the one
    for (let i = 0; i < length; i++) {
      let dayEvents = document.getElementById("day-" + (startDate + i)).children;
      if (dayEvents.length > maxBlocks) {
        maxBlocks = dayEvents.length;
      }

      //address rows that are not the last element in openSlots
      for (let j = 0; j < maxBlocks; j++) {
        if (j > dayEvents.length) {
          break;
        } else if (closedSlots.includes(j)) {
          continue;
        } 
        if (dayEvents[j].classList.contains("isEvent")) {
          closedSlots.push(j);
        }
      }
    }

    let chosenRow;
    for (let i = 0; i <= maxBlocks; i++) {
      if (!closedSlots.includes(i)) {
        chosenRow = i;
        break;
      }
    }

    if (chosenRow < maxBlocks) {
      let node = document.getElementById("day-" + startDate).children[chosenRow];
      node.className = "isEvent";
      ReactDOM.render(<MultiEventWrapper ref={this.calendarRef} {...props} {...multiEventProps} length={length} arrowLeft={arrowLeft} arrowRight={arrowRight} />, node);
    }

    else {
      let tempNode = document.createElement("div");
      tempNode.className = "isEvent";
      document.getElementById("day-" + startDate).appendChild(tempNode);
      ReactDOM.render(<MultiEventWrapper ref={this.calendarRef} {...props} {...multiEventProps} length={length} arrowLeft={arrowLeft} arrowRight={arrowRight} />, tempNode);
    }
    

    for (let i = 1; i < length; i++) {
      //fill in placeholders
      while (document.getElementById("day-" + (startDate + i)).children.length < chosenRow) {
        let tempNode = document.createElement("div");
        tempNode.className = "event";
        document.getElementById("day-" + (startDate + i)).appendChild(tempNode);
      }

      //fill in empty squares for the rest of the event 
      let tempNode = document.createElement("div");
      tempNode.className = "isEvent event below";
      document.getElementById("day-" + (startDate + i)).appendChild(tempNode);
    }
  }

  //get dates based on rrule string between dates
  static getDatesFromRRule(str, eventStart, betweenStart, betweenEnd) {    
    //get recurrences using RRule
    let options = RRule.parseString(str);
    options.dtstart = moment.parseZone(eventStart).utc(true).toDate();
    let rule = new RRule(options);
    let rruleSet = new RRuleSet();
    rruleSet.rrule(rule);
    
    //get dates
    let begin = moment(betweenStart).utc(true).toDate();
    let end = moment(betweenEnd).utc(true).toDate();
    let dates = rruleSet.between(begin, end);
    return dates; 
  }

  renderEvents() {
    this.state.events.forEach((event) => {
      if (event.recurrence) {
        let duration = moment.duration(event.endTime.diff(event.startTime));
        let dates = Calendar.getDatesFromRRule(event.recurrence[0], event.startTime, moment(this.state.current).subtract(duration), moment(this.state.current).add(1, "month"));

        //render recurrences
        dates.forEach((date) => {
          //check if it is in cancelled
          if (event.cancelledEvents.some((cancelledMoment) => (cancelledMoment.isSame(date, "day")))) {
            return;
          }
          //if event has changed
          const changedEvent = event.changedEvents.find((changedEvent) => (changedEvent.originalStartTime.isSame(date, "day")));
          if (changedEvent) {
            var props = {
              name: changedEvent.name,
              startTime: changedEvent.newStartTime,
              endTime: changedEvent.newEndTime,
              description: changedEvent.description,
              location: changedEvent.location,
            }
          } else {
            let eventStart = moment.utc(date); //avoid bad timezone conversions
            let eventEnd = moment(eventStart).add(duration);
            var props = {
              name: event.name,
              startTime: eventStart,
              endTime: eventEnd,
              description: event.description,
              location: event.location,
            };
          }
          
          this.drawMultiEvent(props);   
        });
      } else {
        //render event
        //check if event is in range
        if ((event.startTime.month() != this.state.current.month() || event.startTime.year() != this.state.current.year()) &&
        event.endTime.month() != this.state.current.month() || event.endTime.year() != this.state.current.year()
        ) {
          return;
        }

        this.drawMultiEvent(event);
      }
    });

    let eventProps = {
      tooltipBorderColor: this.state.tooltipBorderColor,
      tooltipTextColor: this.state.tooltipTextColor,
      borderColor: this.state.singleEventBorderColor,
      hoverColor: this.state.singleEventHoverColor,
      textColor: this.state.singleEventTextColor,
      circleColor: this.state.singleEventCircleColor,
    }

    this.state.singleEvents.forEach((event) => {
      if (event.recurrence) {
        let duration = moment.duration(event.endTime.diff(event.startTime));
        
        //get recurrences using RRule
        let dates = Calendar.getDatesFromRRule(event.recurrence[0], event.startTime, moment(this.state.current).subtract(duration), moment(this.state.current).add(1, "month"));

        //render recurrences
        dates.forEach((date) => {
          //check if it is in cancelled
          if (event.cancelledEvents.some((cancelledMoment) => (cancelledMoment.isSame(date, "day")))) {
            return;
          }

          //if event has changed
          const changedEvent = event.changedEvents.find((changedEvent) => (changedEvent.originalStartTime.isSame(date, "day")));
          if (changedEvent) {
            var props = {
              name: changedEvent.name,
              startTime: changedEvent.newStartTime,
              endTime: changedEvent.newEndTime,
              description: changedEvent.description,
              location: changedEvent.location,
            }
          } else {
            let eventStart = moment.utc(date); //avoid bad timezone conversions
            let eventEnd = moment(eventStart).add(duration);
            var props = {
              name: event.name,
              startTime: eventStart,
              endTime: eventEnd,
              description: event.description,
              location: event.location,
            };
          }
          
          let tempNode = document.createElement("div");
          document.getElementById("day-" + moment(props.startTime).date()).appendChild(tempNode);
          ReactDOM.render(<EventWrapper ref={this.calendarRef} {...props} {...eventProps} />, tempNode);
        });
      } else {
        //render event
        if (event.startTime.month() != this.state.current.month() || event.startTime.year() != this.state.current.year()) {
          return;
        }
        let node = document.createElement("div");
        document.getElementById("day-" + moment(event.startTime).date()).appendChild(node);
        ReactDOM.render(<EventWrapper ref={this.calendarRef} {...event} {...eventProps} />, node);
      }
    });
  }

  render() {
    return (
      <div
        className="calendar"
        ref={this.calendarRef}
        css={{
          position: "relative",
          borderColor: this.state.borderColor,
          color: this.state.textColor,
          background: this.state.backgroundColor,
        }}
      >
        <div className="calendar-header">
          <div
            className="calendar-navigate unselectable"
            onClick={this.lastMonth}
          >
            &#10094;
          </div>
          <div>
            <h2 className="calendar-title">
              {this.state.monthNames[this.state.current.month()] + " " + this.state.current.year()}
            </h2>
          </div>
          <div
            className="calendar-navigate unselectable"
            onClick={this.nextMonth}
          >
            &#10095;
          </div>
        </div>
        <div className="calendar-body">
          {this.renderDays()}
          {this.renderDates()}
        </div>
        <div className="calendar-footer">
          <div className="footer-text">
            All times shown in timezone: {this.state.calendarTimezone.replace("_", " ")}
          </div>
          <div className="footer-button">
            <a href={"https://calendar.google.com/calendar/r?cid=" + this.state.calendarId} target="_blank" id="add-to-calendar">
              <div className="logo-plus-button">
                <div className="logo-plus-button-plus-icon"></div>
                <div className="logo-plus-button-lockup">
                  <span className="logo-plus-button-lockup-text">Calendar</span>
                </div>
              </div>
            </a>
          </div>
        </div>
      </div>
    );
  }
}
  

Calendar.propTypes = {
  calendarId: PropTypes.string.isRequired,
  apiKey: PropTypes.string.isRequired,

  useCalendarTimezone: PropTypes.bool,
  
  //calendar colors
  borderColor: PropTypes.string,
  textColor: PropTypes.string,
  backgroundColor: PropTypes.string,
  todayTextColor: PropTypes.string,
  todayBackgroundColor: PropTypes.string,

  //tooltip colors
  tooltipBorderColor: PropTypes.string,
  tooltipTextColor: PropTypes.string,

  //single event colors
  singleEventHoverColor: PropTypes.string,
  singleEventTextColor: PropTypes.string,
  singleEventCircleColor: PropTypes.string,

  //long event colors
  eventTextColor: PropTypes.string,
  eventBackgroundColor: PropTypes.string,
  eventHoverColor: PropTypes.string,
}

Calendar.defaultProps = {
  useCalendarTimezone: true,

  //calendar colors
  textColor: "#51565d",
  borderColor: "LightGray",
  
  //tooltip colors
  tooltipBorderColor: "rgba(81, 86, 93, 0.1)",
  tooltipTextColor: "#51565d",

  //single event colors
  singleEventHoverColor: "rgba(81, 86, 93, 0.1)",
  singleEventTextColor: "#51565d",
  singleEventCircleColor: "#4786ff",

  //long event colors
  eventTextColor: "white",
  eventBackgroundColor: "#4786ff",
  eventHoverColor: "#396DCC",
}