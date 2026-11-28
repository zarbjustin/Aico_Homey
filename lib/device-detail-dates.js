'use strict';

const { reportedDate } = require('./service-dates');

const INVENTORY_DATES = [
  'homelink_last_seen',
  'homelink_last_tested',
  'homelink_replace_by',
  'homelink_retrieved_at',
  'homelink_maintenance_retrieved_at',
];

const dateParts = { day: 'numeric', month: 'short', year: 'numeric' };
const calendarDate = new Intl.DateTimeFormat('en-GB', { ...dateParts, timeZone: 'UTC' });

function displayCapability(id) {
  return id + '_display';
}

function createDeviceDateFormatter(now, timeZone) {
  let localTime;
  if (timeZone) {
    try {
      localTime = new Intl.DateTimeFormat('en-GB', {
        ...dateParts, timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      });
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
    }
  }

  const localYear = localTime?.formatToParts(now).find(part => part.type === 'year').value;
  return (value, { dateOnly = false } = {}) => {
    const date = reportedDate(value);
    if (date === 'Unknown') return date;
    if (dateOnly || date.length === 10 || !localTime) {
      return calendarDate.format(Date.parse(date.slice(0, 10)));
    }

    const parts = Object.fromEntries(localTime.formatToParts(Date.parse(date))
      .map(({ type, value }) => [type, value]));
    const day = parts.day + ' ' + parts.month;
    return parts.year === localYear ? day + ' ' + parts.hour + ':' + parts.minute : day + ' ' + parts.year;
  };
}

module.exports = { INVENTORY_DATES, displayCapability, createDeviceDateFormatter };
