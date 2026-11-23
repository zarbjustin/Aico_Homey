'use strict';

function reportedDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z)?$/.test(value)) return 'Unknown';
  const time = new Date(value);
  if (!Number.isFinite(time.valueOf()) || time.toISOString().slice(0, 10) !== value.slice(0, 10)) {
    return 'Unknown';
  }
  return value.length === 10 ? value : time.toISOString().replace('.000Z', 'Z');
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(isoDate) {
  return Date.parse(isoDate + 'T00:00:00.000Z') / DAY_MS;
}

function localDayNumber(instant, timeZone) {
  if (!Number.isFinite(instant) || typeof timeZone !== 'string' || !timeZone) {
    throw new Error('Homey date or timezone is unavailable.');
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, calendar: 'gregory', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant);
  const date = ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type).value);
  date[0] = date[0].padStart(4, '0');
  return dayNumber(date.join('-'));
}

function wholeDays(value, minimum) {
  const days = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(days) || days < minimum) {
    throw new Error('Enter a whole number of days of at least ' + minimum + '.');
  }
  return days;
}

function replacementDueWithin(value, days, now, timeZone) {
  const threshold = wholeDays(days, 0);
  const date = reportedDate(value);
  if (date === 'Unknown') throw new Error('HomeLINK replacement date is unavailable.');

  const dueDay = dayNumber(date.slice(0, 10));
  return dueDay - localDayNumber(now, timeZone) <= threshold;
}

function lastTestAtLeast(value, days, now, timeZone) {
  const threshold = wholeDays(days, 1);
  const date = reportedDate(value);
  if (date === 'Unknown') throw new Error('HomeLINK last-test date is unavailable.');

  const today = localDayNumber(now, timeZone);
  const instant = date.length > 10 ? Date.parse(date) : undefined;
  const testedOn = instant === undefined ? dayNumber(date) : localDayNumber(instant, timeZone);
  if ((instant !== undefined && instant > now) || testedOn > today) throw new Error('HomeLINK last-test date is in the future.');
  return today - testedOn >= threshold;
}

module.exports = { reportedDate, replacementDueWithin, lastTestAtLeast };
