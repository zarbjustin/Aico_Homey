'use strict';

const Homey = require('homey');

class HomeLinkDriver extends Homey.Driver {
  #maintenanceReported;
  #maintenanceCleared;

  onInit() {
    this.#maintenanceReported = this.homey.flow.getDeviceTriggerCard('homelink_maintenance_reported');
    this.#maintenanceCleared = this.homey.flow.getDeviceTriggerCard('homelink_maintenance_cleared');
    this.homey.flow.getConditionCard('homelink_maintenance_active')
      .registerRunListener(async ({ device }) => device.hasActiveMaintenance());
    this.homey.flow.getConditionCard('homelink_maintenance_data_available')
      .registerRunListener(async ({ device }) => device.hasFreshMaintenance());
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

  async onPairListDevices() {
    const { devices } = await this.homey.app.discover();
    return Array.from(devices.values(), ({ id, model, name }) => ({
      name,
      data: { id, model },
    }));
  }
}

module.exports = HomeLinkDriver;
