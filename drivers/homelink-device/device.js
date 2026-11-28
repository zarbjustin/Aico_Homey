'use strict';

const Homey = require('homey');
const { AlertState, isFreshAlertSnapshot } = require('../../lib/alert-state');
const { INVENTORY_DATES, displayCapability, createDeviceDateFormatter } = require('../../lib/device-detail-dates');
const { ALARM_KINDS, profileFor } = require('../../lib/device-profiles');
const { READING_TIMESTAMP, readingCapabilities } = require('../../lib/environmental-readings');

const INVENTORY_MAX_AGE_MS = 180_000;
const MAINTENANCE_CAPABILITIES = ['homelink_maintenance_alerts', 'homelink_maintenance_retrieved_at'];

class HomeLinkDevice extends Homey.Device {
  #maintenance = new AlertState();
  #alarmStates = new Map(ALARM_KINDS.map((kind) => [kind, new AlertState()]));
  #inventory = null;
  #readings;
  #displayDates = INVENTORY_DATES;

  async onInit() {
    await this.setUnavailable('Waiting for HomeLINK data.');
    for (const id of MAINTENANCE_CAPABILITIES) {
      if (!this.hasCapability(id)) await this.addCapability(id);
    }
    const environmental = profileFor(this.getData().model)?.environmental;
    if (environmental?.length) {
      for (const id of [...environmental, READING_TIMESTAMP]) {
        if (!this.hasCapability(id)) await this.addCapability(id);
      }
      this.#displayDates = [...INVENTORY_DATES, READING_TIMESTAMP];
    }
    for (const source of this.#displayDates) {
      const id = displayCapability(source);
      if (!this.hasCapability(id)) await this.addCapability(id);
      const options = this.getCapabilityOptions(id) ?? {};
      if (!options.preventTag || !options.preventInsights) {
        await this.setCapabilityOptions(id, { ...options, preventTag: true, preventInsights: true });
      }
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
    this.#inventory = null;
    this.#readings = undefined;
    this.#maintenance.reset();
    this.invalidateAlarmPreview();
  }

  invalidateAlarmPreview() {
    for (const state of this.#alarmStates.values()) state.reset();
  }

  #hasRecentInventory(now) {
    if (!this.getAvailable() || !this.#inventory) return false;
    const age = now - this.#inventory.fetchedAt;
    return age >= 0 && age <= INVENTORY_MAX_AGE_MS;
  }

  getDashboardStatus(now = Date.now()) {
    const reporting = this.#hasRecentInventory(now);
    return {
      inventoryFetchedAt: reporting ? this.#inventory.fetchedAt : null,
      maintenanceCount: reporting ? this.#maintenance.count(now) ?? null : null,
    };
  }

  getDiagnosticStatus(now) {
    const dashboard = this.getDashboardStatus(now);
    const inventory = dashboard.inventoryFetchedAt !== null;
    const capabilities = profileFor(this.getData().model)?.environmental;
    return {
      inventory,
      maintenance: dashboard.maintenanceCount !== null,
      environmental: capabilities?.length
        ? inventory && readingCapabilities(this.#readings, capabilities, now)[READING_TIMESTAMP] !== 'Unknown'
        : null,
    };
  }

  getServiceDates(now = Date.now()) {
    if (!this.#hasRecentInventory(now)) throw new Error('A recent HomeLINK inventory update is required.');
    return this.#inventory;
  }

  hasFreshMaintenance() {
    return this.getAvailable() && this.#maintenance.count() !== undefined;
  }

  hasActiveMaintenance() {
    const count = this.#maintenance.count();
    if (!this.getAvailable() || count === undefined) throw new Error('HomeLINK maintenance data is unavailable.');
    return count > 0;
  }

  async applyInventory(record, fetchedAt, alerts, current, samples) {
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
    const environmental = profileFor(record.model)?.environmental;
    if (environmental?.length) Object.assign(values, readingCapabilities(samples, environmental));
    const formatDate = createDeviceDateFormatter(fetchedAt, this.homey.clock.getTimezone());
    for (const id of this.#displayDates) {
      values[displayCapability(id)] = formatDate(values[id], { dateOnly: id === 'homelink_replace_by' });
    }
    for (const [key, value] of Object.entries(values)) {
      if (!current()) return;
      if (this.getCapabilityValue(key) !== value) await this.setCapabilityValue(key, value);
    }
    if (!current()) return;
    const change = fresh ? this.#maintenance.observe(record.propertyReference, alerts.fetchedAt, ids) : undefined;
    if (!this.getAvailable()) await this.setAvailable();
    if (!current()) return;
    this.#inventory = {
      fetchedAt,
      lastTested: record.values.homelink_last_tested,
      replaceBy: record.values.homelink_replace_by,
    };
    this.#readings = samples;
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
