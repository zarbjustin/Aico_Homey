'use strict';

const Homey = require('homey');
const { HomeLinkClient, IncompleteInventoryError, readCredentials } = require('./lib/homelink-client');
const { normalizeInventory, summarizeInventory } = require('./lib/inventory');
const { HomeLinkMqtt, readMqttCredentials } = require('./lib/homelink-mqtt');
const { createSupportReport } = require('./lib/support-report');
const { version } = require('./app.json');

const CREDENTIALS_KEY = 'homelink_web_api';
const MQTT_KEY = 'homelink_mqtt';
const ALARM_PREVIEW_KEY = 'homelink_alarm_flow_preview';
const POLL_MS = 60_000;
const EVENT_DEBOUNCE_MS = 2_000;
const EVENT_MIN_REFRESH_MS = 30_000;
const MAX_CONCURRENT_PROPERTIES = 4;

class HomeLinkApp extends Homey.App {
  #client;
  #checkClient;
  #checkRetryAt = 0;
  #inventoryStatus;
  #lastRead = {};
  #devices = new Set();
  #sync;
  #repeat = false;
  #stopped = false;
  #timer;
  #mqtt;
  #eventTimer;
  #eventRefreshAfter = 0;
  #alarmPreviewSince = null;
  #settingsChanged = (key) => {
    if (key === CREDENTIALS_KEY) this.#configure();
    if (key === MQTT_KEY) this.#configureMqtt();
    if (key === ALARM_PREVIEW_KEY) {
      this.#resetAlarmPreview();
      this.#requestSync();
    }
  };

  onInit() {
    this.homey.settings.on('set', this.#settingsChanged);
    this.homey.settings.on('unset', this.#settingsChanged);
    this.#configure();
    this.#timer = this.homey.setInterval(() => this.#requestSync(), POLL_MS);
  }

  onUninit() {
    this.#stopped = true;
    this.homey.clearInterval(this.#timer);
    this.homey.settings.removeListener('set', this.#settingsChanged);
    this.homey.settings.removeListener('unset', this.#settingsChanged);
    this.#stopMqtt();
    this.#client?.close();
    this.#checkClient?.close();
    this.#devices.clear();
  }

  get alarmPreviewSince() {
    return this.#alarmPreviewSince;
  }

  #resetAlarmPreview() {
    this.#alarmPreviewSince = this.homey.settings.get(ALARM_PREVIEW_KEY) === true ? Date.now() : null;
    for (const device of this.#devices) device.invalidateAlarmPreview();
  }

  #configure() {
    const credentials = readCredentials(this.homey.settings.get(CREDENTIALS_KEY));
    this.#client?.close();
    this.#client = credentials ? new HomeLinkClient(credentials) : undefined;
    this.#inventoryStatus = undefined;
    this.#lastRead = {};
    for (const device of this.#devices) device.invalidateObservations();
    this.#resetAlarmPreview();
    this.#configureMqtt();
    this.#requestSync();
  }

  #stopMqtt() {
    this.#mqtt?.close();
    this.#mqtt = undefined;
    if (this.#eventTimer !== undefined) this.homey.clearTimeout(this.#eventTimer);
    this.#eventTimer = undefined;
    this.#eventRefreshAfter = 0;
  }

  #configureMqtt() {
    this.#stopMqtt();
    const credentials = readMqttCredentials(this.homey.settings.get(MQTT_KEY));
    if (this.#stopped || !this.#client || !this.#devices.size || !credentials) return;
    const mqtt = new HomeLinkMqtt(credentials, () => {
      if (this.#mqtt === mqtt) this.#queueEventRefresh();
    });
    this.#mqtt = mqtt;
  }

  #queueEventRefresh() {
    if (this.#stopped || !this.#client || !this.#devices.size || this.#eventTimer !== undefined) return;
    const now = Date.now();
    const delay = Math.max(EVENT_DEBOUNCE_MS, this.#eventRefreshAfter - now, this.#client.retryAt - now);
    const timer = this.homey.setTimeout(() => {
      if (this.#eventTimer !== timer) return;
      this.#eventTimer = undefined;
      if (this.#sync || this.#client.retryAt > Date.now()) {
        this.#queueEventRefresh();
        return;
      }
      this.#eventRefreshAfter = Date.now() + EVENT_MIN_REFRESH_MS;
      this.#requestSync(true);
    }, Math.min(POLL_MS, delay));
    this.#eventTimer = timer;
  }

  getEventStatus() {
    if (this.#mqtt) return { state: this.#mqtt.state };
    const configured = readMqttCredentials(this.homey.settings.get(MQTT_KEY));
    return { state: configured ? 'waiting' : 'disabled' };
  }

  getSupportReport() {
    const now = Date.now();
    return {
      report: createSupportReport({
        version,
        now,
        inventoryState: this.getConnectionStatus(now).state,
        mqttState: this.getEventStatus().state,
        alarmPreview: this.#alarmPreviewSince !== null,
        devices: Array.from(this.#devices, (device) => device.getDiagnosticStatus(now)),
        lastRead: this.#lastRead,
      }),
    };
  }

  async #readInventory(client, refresh) {
    const snapshot = await client.getInventory({ refresh });
    const devices = normalizeInventory(snapshot.rows);
    return { devices, fetchedAt: snapshot.fetchedAt, summary: summarizeInventory(snapshot.rows, devices) };
  }

  async checkConnection(input) {
    const credentials = readCredentials(input);
    if (!credentials) throw new Error('Enter a HomeLINK client ID and client secret.');
    if (this.#stopped) throw new Error('The HomeLINK app is stopping.');
    if (this.#checkClient) throw new Error('A HomeLINK access check is already running.');
    if (Math.max(this.#checkRetryAt, this.#client?.retryAt ?? 0) > Date.now()) {
      throw new Error('HomeLINK rate limited the request. Try again later.');
    }

    const client = new HomeLinkClient(credentials);
    this.#checkClient = client;
    try {
      const { fetchedAt, summary } = await this.#readInventory(client);
      return { fetchedAt, summary };
    } finally {
      this.#checkRetryAt = Math.max(this.#checkRetryAt, client.retryAt);
      client.close();
      this.#checkClient = undefined;
    }
  }

  getConnectionStatus(now = Date.now()) {
    const status = this.#inventoryStatus;
    if (!this.#client) return { state: 'unconfigured' };
    if (!status) return { state: 'waiting' };
    if (status.state !== 'available') return status;

    const age = now - status.fetchedAt;
    if (age < 0 || age > 3 * POLL_MS) return { state: 'stale', fetchedAt: status.fetchedAt };
    return status;
  }

  async discover({ refresh = false } = {}) {
    const client = this.#client;
    if (!client) throw new Error('Add HomeLINK Web API credentials in the app settings.');

    try {
      const { devices, fetchedAt, summary } = await this.#readInventory(client, refresh);
      if (client !== this.#client || this.#stopped) throw new Error('HomeLINK credentials changed.');
      this.#inventoryStatus = { state: 'available', fetchedAt, summary };
      this.#lastRead.inventory = fetchedAt;
      return { devices, fetchedAt };
    } catch (error) {
      if (client === this.#client && !this.#stopped) {
        this.#inventoryStatus = { state: error instanceof IncompleteInventoryError ? 'incomplete' : 'unavailable' };
      }
      throw error;
    }
  }

  addDevice(device) {
    const firstDevice = this.#devices.size === 0;
    this.#devices.add(device);
    if (firstDevice) this.#configureMqtt();
    this.#requestSync();
  }

  removeDevice(device) {
    this.#devices.delete(device);
    if (!this.#devices.size) this.#stopMqtt();
  }

  #requestSync(refresh = false) {
    if (this.#stopped || !this.#devices.size) return;
    if (this.#sync) {
      this.#repeat = true;
      return;
    }
    this.#sync = this.#syncDevices(refresh).finally(() => {
      this.#sync = undefined;
      if (this.#repeat) {
        this.#repeat = false;
        this.#requestSync();
      }
    });
  }

  async #readProperties(client, references, feed, read) {
    const snapshots = new Map();
    for (let index = 0; index < references.length; index += MAX_CONCURRENT_PROPERTIES) {
      if (this.#stopped || client !== this.#client) break;
      const batch = references.slice(index, index + MAX_CONCURRENT_PROPERTIES);
      await Promise.allSettled(batch.map(async (reference) => {
        const snapshot = await read(reference);
        if (this.#stopped || client !== this.#client) return;
        snapshots.set(reference, snapshot);
        this.#lastRead[feed] = Math.max(this.#lastRead[feed] ?? 0, snapshot.fetchedAt);
      }));
    }
    return snapshots;
  }

  async #syncDevices(refresh) {
    const client = this.#client;
    let snapshot;
    let message;
    try {
      snapshot = await this.discover({ refresh });
    } catch (error) {
      message = error.message;
    }
    if (this.#stopped || client !== this.#client) return;
    const devices = Array.from(this.#devices, (device) => {
      const { id, model } = device.getData();
      const record = snapshot?.devices.get(id);
      return { device, record: record?.model === model ? record : undefined };
    });
    const references = Array.from(new Set(devices.map(({ record }) => record?.propertyReference).filter(Boolean)));
    const maintenance = await this.#readProperties(client, references, 'maintenance',
      (reference) => client.getPropertyMaintenance(reference, { refresh }));
    const environmentalProperties = Array.from(new Set(devices
      .filter(({ record }) => record?.hasReadings)
      .map(({ record }) => record.propertyReference).filter(Boolean)));
    const readings = this.#readProperties(client, environmentalProperties, 'environmental',
      (reference) => client.getPropertyReadings(reference));
    await Promise.allSettled(devices.map(async ({ device, record }) => {
      const current = () => !this.#stopped && client === this.#client && this.#devices.has(device);
      if (!current()) return;
      try {
        if (!snapshot) {
          device.invalidateObservations();
          await device.setUnavailable(message);
          return;
        }
        if (!record) {
          device.invalidateObservations();
          await device.setUnavailable('This device is missing from the current HomeLINK inventory.');
          return;
        }
        const alerts = maintenance.get(record.propertyReference);
        const samples = record.hasReadings
          ? (await readings).get(record.propertyReference)?.byDevice.get(record.id)
          : undefined;
        await device.applyInventory(record, snapshot.fetchedAt, alerts, current, samples);
      } catch {
        if (current()) {
          device.invalidateObservations();
          await device.setUnavailable('Homey could not display the HomeLINK data.');
        }
      }
    }));
  }
}

module.exports = HomeLinkApp;
