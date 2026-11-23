'use strict';

const Homey = require('homey');

class HomeLinkDevice extends Homey.Device {
  async onInit() {
    await this.setUnavailable('Waiting for HomeLINK data.');
    this.homey.app.addDevice(this);
  }

  onDeleted() {
    this.homey.app.removeDevice(this);
  }

  onUninit() {
    this.homey.app.removeDevice(this);
  }

  async applyInventory(record, fetchedAt, current) {
    const values = {
      ...record.values,
      homelink_retrieved_at: new Date(fetchedAt).toISOString(),
    };
    for (const [key, value] of Object.entries(values)) {
      if (!current()) return;
      if (this.getCapabilityValue(key) !== value) await this.setCapabilityValue(key, value);
    }
    if (current() && !this.getAvailable()) await this.setAvailable();
  }
}

module.exports = HomeLinkDevice;
