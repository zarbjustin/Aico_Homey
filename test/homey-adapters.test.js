'use strict';

const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const { test } = require('node:test');
const vm = require('node:vm');
const flowManifest = require('../drivers/homelink-device/driver.flow.compose.json');

function loadAdapter(path, baseClass, constructor) {
  const filename = require.resolve(path);
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  const load = vm.runInThisContext('(function (require, module) {\n' + fs.readFileSync(filename, 'utf8') + '\n})', { filename });
  load((name) => name === 'homey' ? { [baseClass]: constructor } : localRequire(name), module);
  return module.exports;
}

class FakeHomeyObject {
  constructor(homey) { this.homey = homey; }
}

test('pairs, migrates, dispatches Flow cards and recovers without replaying', { timeout: 3000 }, async (t) => {
  const settings = new EventEmitter();
  let credentials = { clientId: 'test-id', clientSecret: 'test-secret' };
  let now = 10_000;
  let alertsAvailable = true;
  let alertIds = ['initial-event'];
  settings.get = () => credentials;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async (url) => {
    const { hostname, pathname } = new URL(url);
    if (hostname === 'auth.live.homelync.io') {
      return Response.json({ accessToken: 'synthetic' });
    }
    if (pathname === '/v1/property/SYNTHETIC-HOME/alerts') {
      if (!alertsAvailable) return Response.json({}, { status: 503 });
      return Response.json({ count: alertIds.length, results: alertIds.map((id) => ({
        id,
        type: 'DEVICE',
        status: 'ACTIVE',
        category: 'PRIORITY_MAINTENANCE',
        eventType: 'HEAD_REMOVED',
        serialNumber: 'SYNTHETIC-ADAPTER',
        propertyReference: 'SYNTHETIC-HOME',
        _rel: { device: 'device/SYNTHETIC-ADAPTER', property: 'property/SYNTHETIC-HOME' },
      })) });
    }
    return Response.json({ results: [{
      model: 'Ei3030',
      serialNumber: 'SYNTHETIC-ADAPTER',
      status: { operationalStatus: 'GOOD' },
      _rel: { property: 'property/SYNTHETIC-HOME' },
    }] });
  });

  const flowEvents = new EventEmitter();
  const conditionListeners = new Map();
  const homey = {
    settings,
    setInterval: t.mock.fn(),
    clearInterval: t.mock.fn(),
    flow: {
      getDeviceTriggerCard: (id) => {
        const card = flowManifest.triggers.find((trigger) => trigger.id === id);
        assert.ok(card, 'Missing trigger in Homey Compose: ' + id);
        return {
          trigger: async (device, tokens) => {
            assert.deepEqual(Object.keys(tokens).sort(), card.tokens.map((token) => token.name).sort());
            flowEvents.emit(id, { device, tokens });
          },
        };
      },
      getConditionCard: (id) => {
        assert.ok(flowManifest.conditions.some((card) => card.id === id), 'Missing condition in Homey Compose: ' + id);
        return { registerRunListener: (listener) => conditionListeners.set(id, listener) };
      },
    },
  };
  const App = loadAdapter('../app', 'App', FakeHomeyObject);
  const Driver = loadAdapter('../drivers/homelink-device/driver', 'Driver', FakeHomeyObject);
  const Device = loadAdapter('../drivers/homelink-device/device', 'Device', FakeHomeyObject);
  const app = new App(homey);
  homey.app = app;
  app.onInit();
  t.after(() => app.onUninit());

  const driver = new Driver(homey);
  driver.onInit();
  const [pair] = await driver.onPairListDevices();
  assert.equal(pair.name, 'Ei3030');
  assert.deepEqual(Object.keys(pair.data), ['id', 'model']);
  const device = new Device(homey);
  device.driver = driver;
  device.error = t.mock.fn();
  const events = new EventEmitter();
  const capabilities = new Map();
  let available = false;
  const existingCapabilities = new Set(['homelink_maintenance_alerts']);
  device.hasCapability = (id) => existingCapabilities.has(id);
  device.addCapability = t.mock.fn(async (id) => { existingCapabilities.add(id); });
  device.getData = () => pair.data;
  device.getAvailable = () => available;
  device.getCapabilityValue = (id) => capabilities.get(id);
  device.setCapabilityValue = async (id, value) => { capabilities.set(id, value); events.emit(id, value); };
  device.setAvailable = async () => { available = true; events.emit('available'); };
  device.setUnavailable = async (message) => { available = false; events.emit('unavailable', message); };

  const triggers = [];
  for (const id of ['homelink_maintenance_reported', 'homelink_maintenance_cleared']) {
    flowEvents.on(id, (event) => triggers.push({ id, ...event }));
  }
  const updated = once(events, 'available');
  await device.onInit();
  await updated;
  assert.equal(capabilities.get('homelink_operational_status'), 'Good');
  assert.equal(capabilities.get('homelink_last_seen'), 'Unknown');
  assert.match(capabilities.get('homelink_retrieved_at'), /Z$/);
  assert.equal(capabilities.get('homelink_maintenance_alerts'), '1 active');
  assert.equal(device.addCapability.mock.callCount(), 1);
  assert.equal(device.addCapability.mock.calls[0].arguments[0], 'homelink_maintenance_retrieved_at');
  assert.equal(globalThis.fetch.mock.callCount(), 3);
  const active = conditionListeners.get('homelink_maintenance_active');
  const dataAvailable = conditionListeners.get('homelink_maintenance_data_available');
  assert.equal(await active({ device }), true);
  assert.equal(await dataAvailable({ device }), true);
  assert.equal(triggers.length, 0);

  const [poll] = homey.setInterval.mock.calls[0].arguments;
  const reported = once(flowEvents, 'homelink_maintenance_reported');
  now += 300_000;
  alertIds = ['new-event'];
  poll();
  assert.deepEqual((await reported)[0], {
    device,
    tokens: { new_count: 1, active_count: 1, observed_at: new Date(now).toISOString() },
  });

  const cleared = once(flowEvents, 'homelink_maintenance_cleared');
  now += 300_000;
  alertIds = [];
  poll();
  assert.deepEqual((await cleared)[0], {
    device,
    tokens: { previous_count: 1, observed_at: new Date(now).toISOString() },
  });
  assert.equal(await active({ device }), false);

  const missingAlerts = once(events, 'homelink_maintenance_retrieved_at');
  now += 300_000;
  alertsAvailable = false;
  poll();
  assert.equal((await missingAlerts)[0], 'Unknown');
  assert.equal(capabilities.get('homelink_maintenance_alerts'), 'Unknown');
  assert.equal(capabilities.get('homelink_operational_status'), 'Good');
  assert.equal(available, true);
  assert.equal(await dataAvailable({ device }), false);
  await assert.rejects(active({ device }), /maintenance data is unavailable/);

  const recovered = once(events, 'homelink_maintenance_retrieved_at');
  now += 60_000;
  alertsAvailable = true;
  alertIds = ['first-after-gap'];
  poll();
  assert.equal((await recovered)[0], new Date(now).toISOString());
  assert.equal(await active({ device }), true);
  assert.equal(triggers.length, 2);

  const unavailable = once(events, 'unavailable');
  credentials = undefined;
  settings.emit('unset', 'homelink_web_api');
  assert.match((await unavailable)[0], /Add HomeLINK Web API credentials/);
  assert.equal(available, false);
  await assert.rejects(driver.onPairListDevices(), /Add HomeLINK Web API credentials/);
});
