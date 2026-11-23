'use strict';

const Homey = require('homey');
const { HomeLinkClient, readCredentials } = require('./lib/homelink-client');
const { normalizeInventory } = require('./lib/inventory');

const CREDENTIALS_KEY = 'homelink_web_api';
const POLL_MS = 60_000;

class HomeLinkApp extends Homey.App {
  #client;
  #devices = new Set();
  #sync;
  #repeat = false;
  #stopped = false;
  #timer;
  #settingsChanged = (key) => {
    if (key === CREDENTIALS_KEY) this.#configure();
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
    this.#client?.close();
    this.#devices.clear();
  }

  #configure() {
    const credentials = readCredentials(this.homey.settings.get(CREDENTIALS_KEY));
    this.#client?.close();
    this.#client = credentials ? new HomeLinkClient(credentials) : undefined;
    this.#requestSync();
  }

  async discover() {
    const client = this.#client;
    if (!client) throw new Error('Add HomeLINK Web API credentials in the app settings.');
    const snapshot = await client.getInventory();
    if (client !== this.#client || this.#stopped) throw new Error('HomeLINK credentials changed.');
    return { devices: normalizeInventory(snapshot.rows), fetchedAt: snapshot.fetchedAt };
  }

  addDevice(device) {
    this.#devices.add(device);
    this.#requestSync();
  }

  removeDevice(device) {
    this.#devices.delete(device);
  }

  #requestSync() {
    if (this.#stopped || !this.#devices.size) return;
    if (this.#sync) {
      this.#repeat = true;
      return;
    }
    this.#sync = this.#syncDevices().finally(() => {
      this.#sync = undefined;
      if (this.#repeat) {
        this.#repeat = false;
        this.#requestSync();
      }
    });
  }

  async #syncDevices() {
    const client = this.#client;
    let snapshot;
    let message;
    try {
      snapshot = await this.discover();
    } catch (error) {
      message = error.message;
    }
    if (this.#stopped || client !== this.#client) return;
    await Promise.allSettled(Array.from(this.#devices, async (device) => {
      const current = () => !this.#stopped && client === this.#client && this.#devices.has(device);
      if (!current()) return;
      try {
        if (!snapshot) {
          await device.setUnavailable(message);
          return;
        }
        const data = device.getData();
        const record = snapshot.devices.get(data.id);
        if (!record || record.model !== data.model) {
          await device.setUnavailable('This device is missing from the current HomeLINK inventory.');
          return;
        }
        await device.applyInventory(record, snapshot.fetchedAt, current);
      } catch {
        if (current()) await device.setUnavailable('Homey could not display the HomeLINK data.');
      }
    }));
  }
}

module.exports = HomeLinkApp;
