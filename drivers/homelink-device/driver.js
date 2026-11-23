'use strict';

const Homey = require('homey');
const { ALARM_KINDS } = require('../../lib/device-profiles');
const { replacementDueWithin, lastTestAtLeast } = require('../../lib/service-dates');

class HomeLinkDriver extends Homey.Driver {
  #maintenanceReported;
  #maintenanceCleared;
  #alarmReported = new Map();

  onInit() {
    this.#maintenanceReported = this.homey.flow.getDeviceTriggerCard('homelink_maintenance_reported');
    this.#maintenanceCleared = this.homey.flow.getDeviceTriggerCard('homelink_maintenance_cleared');
    for (const kind of ALARM_KINDS) {
      this.#alarmReported.set(kind, this.homey.flow.getDeviceTriggerCard('homelink_' + kind + '_reported'));
    }
    this.homey.flow.getConditionCard('homelink_maintenance_active')
      .registerRunListener(async ({ device }) => device.hasActiveMaintenance());
    this.homey.flow.getConditionCard('homelink_maintenance_data_available')
      .registerRunListener(async ({ device }) => device.hasFreshMaintenance());
    this.homey.flow.getConditionCard('homelink_replacement_due')
      .registerRunListener(async ({ device, days }) => {
        const now = Date.now();
        const { replaceBy } = device.getServiceDates(now);
        return replacementDueWithin(replaceBy, days, now, this.homey.clock.getTimezone());
      });
    this.homey.flow.getConditionCard('homelink_test_reminder')
      .registerRunListener(async ({ device, days }) => {
        const now = Date.now();
        const { lastTested } = device.getServiceDates(now);
        return lastTestAtLeast(lastTested, days, now, this.homey.clock.getTimezone());
      });
  }

  triggerMaintenanceChange(device, change) {
    if (change.kind === 'reported') {
      return this.#maintenanceReported.trigger(device, {
        new_count: change.newCount,
        active_count: change.activeCount,
        observed_at: change.observedAt,
      });
    }
    return this.#maintenanceCleared.trigger(device, {
      previous_count: change.previousCount,
      observed_at: change.observedAt,
    });
  }

  triggerAlarmReport(device, kind, change) {
    return this.#alarmReported.get(kind).trigger(device, {
      new_count: change.newCount,
      observed_at: change.observedAt,
    });
  }

  async onPairListDevices() {
    const { devices } = await this.homey.app.discover();
    return Array.from(devices.values(), ({ id, model, name }) => ({
      name,
      data: { id, model },
    }));
  }
}

module.exports = HomeLinkDriver;
