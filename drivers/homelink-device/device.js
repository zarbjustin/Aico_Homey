'use strict';

const Homey = require('homey');
const { AlertState, isFreshAlertSnapshot } = require('../../lib/alert-state');
const { ALARM_KINDS, profileFor } = require('../../lib/device-profiles');

const MAINTENANCE_CAPABILITIES = ['homelink_maintenance_alerts', 'homelink_maintenance_retrieved_at'];

class HomeLinkDevice extends Homey.Device {
  #maintenance = new AlertState();
  #alarmStates = new Map(ALARM_KINDS.map((kind) => [kind, new AlertState()]));
  #inventoryFetchedAt = null;

  async onInit() {
    await this.setUnavailable('Waiting for HomeLINK data.');
    for (const id of MAINTENANCE_CAPABILITIES) {
      if (!this.hasCapability(id)) await this.addCapability(id);
    }
    this.homey.app.addDevice(this);
  }

  onDeleted() {
    this.invalidateObservations();
    this.homey.app.removeDevice(this);
  }

  onUninit() {
    this.invalidateObservations();
    this.homey.app.removeDevice(this);
  }

  invalidateObservations() {
    this.#inventoryFetchedAt = null;
    this.#maintenance.reset();
    this.invalidateAlarmPreview();
  }

  invalidateAlarmPreview() {
    for (const state of this.#alarmStates.values()) state.reset();
  }

  getDashboardStatus(now = Date.now()) {
    const fetchedAt = this.#inventoryFetchedAt;
    const reporting = this.getAvailable() && fetchedAt !== null && fetchedAt <= now && now - fetchedAt <= 180_000;
    return {
      inventoryFetchedAt: reporting ? fetchedAt : null,
      maintenanceCount: reporting ? this.#maintenance.count(now) ?? null : null,
    };
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
    const fresh = isFreshAlertSnapshot(alerts?.fetchedAt);
    this.#maintenance.resetIfPropertyChanged(record.propertyReference);
    if (!fresh) this.#maintenance.reset();
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
    if (!current()) return;
    this.#inventoryFetchedAt = fetchedAt;
    await this.#updateAlarmFlows(record, alerts, current);
    if (current() && change) {
      try {
        await this.driver.triggerMaintenanceChange(this, change);
      } catch {
        this.error('Homey could not dispatch the HomeLINK maintenance Flow.');
      }
    }
  }

  async #updateAlarmFlows(record, alerts, current) {
    const enabledSince = this.homey.app.alarmPreviewSince;
    if (enabledSince === null || !alerts?.alarmsByDevice || alerts.fetchedAt < enabledSince ||
      !isFreshAlertSnapshot(alerts.fetchedAt)) {
      this.invalidateAlarmPreview();
      return;
    }

    const byKind = alerts.alarmsByDevice.get(record.id);
    const kinds = profileFor(record.model)?.alarms ?? [];
    for (const kind of kinds) {
      if (!current() || this.homey.app.alarmPreviewSince !== enabledSince) return;
      const state = this.#alarmStates.get(kind);
      const change = state.observe(record.propertyReference, alerts.fetchedAt, byKind?.get(kind));
      if (change?.kind !== 'reported') continue;
      try {
        await this.driver.triggerAlarmReport(this, kind, change);
      } catch {
        this.error('Homey could not dispatch the HomeLINK alarm preview Flow.');
      }
    }
  }
}

module.exports = HomeLinkDevice;
