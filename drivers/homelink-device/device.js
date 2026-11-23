'use strict';

const Homey = require('homey');
const { MaintenanceState, isFreshMaintenance } = require('../../lib/maintenance-state');

const MAINTENANCE_CAPABILITIES = ['homelink_maintenance_alerts', 'homelink_maintenance_retrieved_at'];

class HomeLinkDevice extends Homey.Device {
  #maintenance = new MaintenanceState();

  async onInit() {
    await this.setUnavailable('Waiting for HomeLINK data.');
    for (const id of MAINTENANCE_CAPABILITIES) {
      if (!this.hasCapability(id)) await this.addCapability(id);
    }
    this.homey.app.addDevice(this);
  }

  onDeleted() {
    this.invalidateMaintenance();
    this.homey.app.removeDevice(this);
  }

  onUninit() {
    this.invalidateMaintenance();
    this.homey.app.removeDevice(this);
  }

  invalidateMaintenance() {
    this.#maintenance.reset();
  }

  hasFreshMaintenance() {
    return this.getAvailable() && this.#maintenance.count() !== undefined;
  }

  hasActiveMaintenance() {
    const count = this.#maintenance.count();
    if (!this.getAvailable() || count === undefined) throw new Error('HomeLINK maintenance data is unavailable.');
    return count > 0;
  }

  async applyInventory(record, fetchedAt, alerts, current) {
    if (!current()) return;
    const fresh = isFreshMaintenance(alerts?.fetchedAt);
    this.#maintenance.resetIfPropertyChanged(record.propertyReference);
    if (!fresh) this.invalidateMaintenance();
    const ids = fresh ? alerts.activeByDevice.get(record.id) : undefined;
    const count = ids?.size ?? 0;
    const maintenance = count > 0 ? count + ' active' : 'None reported';
    const values = {
      ...record.values,
      homelink_retrieved_at: new Date(fetchedAt).toISOString(),
      homelink_maintenance_alerts: fresh ? maintenance : 'Unknown',
      homelink_maintenance_retrieved_at: fresh ? new Date(alerts.fetchedAt).toISOString() : 'Unknown',
    };
    for (const [key, value] of Object.entries(values)) {
      if (!current()) return;
      if (this.getCapabilityValue(key) !== value) await this.setCapabilityValue(key, value);
    }
    if (!current()) return;
    const change = fresh ? this.#maintenance.observe(record.propertyReference, alerts.fetchedAt, ids) : undefined;
    if (!this.getAvailable()) await this.setAvailable();
    if (current() && change) {
      try {
        await this.driver.triggerMaintenanceChange(this, change);
      } catch {
        this.error('Homey could not dispatch the HomeLINK maintenance Flow.');
      }
    }
  }
}

module.exports = HomeLinkDevice;
