'use strict';

const { profileFor } = require('../../lib/device-profiles');
const { replacementDueWithin, lastTestAtLeast } = require('../../lib/service-dates');

function threshold(value, minimum, fallback) {
  const days = typeof value === 'string' && /^\d{1,3}$/.test(value) ? Number(value) : NaN;
  return days >= minimum && days <= 365 ? days : fallback;
}

function countDate(result, predicate, value, now, timeZone) {
  try {
    const due = predicate(value, result.days, now, timeZone);
    result.checked += 1;
    if (due) result.due += 1;
  } catch {
    // Missing or implausible dates do not contribute to coverage.
  }
}

module.exports = {
  async getService({ homey, params }) {
    const replacement = { days: threshold(params?.replacementDays, 0, 90), checked: 0, due: 0 };
    const lastTest = { days: threshold(params?.testDays, 1, 7), checked: 0, due: 0 };
    const devices = homey.drivers.getDriver('homelink-device').getDevices();
    const now = Date.now();
    const timeZone = homey.clock.getTimezone();
    let alarms = 0;
    for (const device of devices) {
      const profile = profileFor(device.getData().model);
      if (!profile?.alarms.length) continue;
      alarms += 1;
      if (device.getDashboardStatus(now).inventoryFetchedAt === null) continue;
      const dates = device.getServiceDates(now);
      countDate(replacement, replacementDueWithin, dates.replaceBy, now, timeZone);
      countDate(lastTest, lastTestAtLeast, dates.lastTested, now, timeZone);
    }
    return { alarms, replacement, lastTest };
  },
};
