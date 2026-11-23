'use strict';

const Homey = require('homey');

const MAINTENANCE_CAPABILITIES = ['homelink_maintenance_alerts', 'homelink_maintenance_retrieved_at'];

class HomeLinkDevice extends Homey.Device {
  async onInit() {
    await this.setUnavailable('Waiting for HomeLINK data.');
    for (const id of MAINTENANCE_CAPABILITIES) {
      if (!this.hasCapability(id)) await this.addCapability(id);
    }
    this.homey.app.addDevice(this);
  }

  onDeleted() {
    this.homey.app.removeDevice(this);
  }

  onUninit() {
    this.homey.app.removeDevice(this);
  }

  async applyInventory(record, fetchedAt, alerts, current) {
    const count = alerts?.counts.get(record.id) ?? 0;
    const maintenance = count > 0 ? count + ' active' : 'None reported';
    const values = {
      ...record.values,
      homelink_retrieved_at: new Date(fetchedAt).toISOString(),
      homelink_maintenance_alerts: alerts ? maintenance : 'Unknown',
      homelink_maintenance_retrieved_at: alerts ? new Date(alerts.fetchedAt).toISOString() : 'Unknown',
    };
    for (const [key, value] of Object.entries(values)) {
      if (!current()) return;
      if (this.getCapabilityValue(key) !== value) await this.setCapabilityValue(key, value);
    }
    if (current() && !this.getAvailable()) await this.setAvailable();
  }
}

module.exports = HomeLinkDevice;
