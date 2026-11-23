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

test('pairs, migrates, dispatches gated Flow cards, and recovers without replaying', { timeout: 5000 }, async (t) => {
  const settings = new EventEmitter();
  let credentials = { clientId: 'test-id', clientSecret: 'test-secret' };
  let now = 10_000;
  let alertsAvailable = true;
  let preview = false;
  let alertIds = ['initial-event'];
  let alarms = [['existing-fire', 'FIRE_ALARM']];
  settings.get = (key) => key === 'homelink_alarm_flow_preview' ? preview : credentials;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async (url) => {
    const { hostname, pathname } = new URL(url);
    if (hostname === 'auth.live.homelync.io') {
      return Response.json({ accessToken: 'synthetic' });
    }
    if (pathname === '/v1/property/SYNTHETIC-HOME/alerts') {
      if (!alertsAvailable) return Response.json({}, { status: 503 });
      const shared = {
        type: 'DEVICE',
        status: 'ACTIVE',
        serialNumber: 'SYNTHETIC-ADAPTER',
        propertyReference: 'SYNTHETIC-HOME',
        _rel: { device: 'device/SYNTHETIC-ADAPTER', property: 'property/SYNTHETIC-HOME' },
      };
      const results = [
        ...alertIds.map((id) => ({ ...shared, id, category: 'PRIORITY_MAINTENANCE', eventType: 'HEAD_REMOVED' })),
        ...alarms.map(([id, eventType, eventTypeId]) => ({ ...shared, id, category: 'ALARM', eventType, eventTypeId })),
      ];
      return Response.json({ count: results.length, results });
    }
    return Response.json({ results: [{
      model: 'Ei3030',
      serialNumber: 'SYNTHETIC-ADAPTER',
      status: { operationalStatus: 'GOOD', lastTestedDate: '1969-12-31' },
      replaceDate: '1970-01-03T00:00:00Z',
      _rel: { property: 'property/SYNTHETIC-HOME' },
    }] });
  });

  const flowEvents = new EventEmitter();
  const conditionListeners = new Map();
  const homey = {
    settings,
    setInterval: t.mock.fn(),
    clearInterval: t.mock.fn(),
    clock: { getTimezone: () => 'Europe/London' },
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
  assert.equal(app.alarmPreviewSince, null);
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
  for (const { id } of flowManifest.triggers) {
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
  const replacementDue = conditionListeners.get('homelink_replacement_due');
  const testReminder = conditionListeners.get('homelink_test_reminder');
  assert.equal(await replacementDue({ device, days: 2 }), true);
  assert.equal(await replacementDue({ device, days: 1 }), false);
  assert.equal(await testReminder({ device, days: 1 }), true);
  assert.equal(await testReminder({ device, days: 2 }), false);
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

  now += 1;
  preview = true;
  settings.emit('set', 'homelink_alarm_flow_preview');
  assert.equal(app.alarmPreviewSince, now);
  const seeded = once(events, 'homelink_maintenance_retrieved_at');
  now += 300_000;
  poll();
  await seeded;
  assert.equal(triggers.length, 2);

  const co = once(flowEvents, 'homelink_co_reported');
  now += 300_000;
  alarms = [...alarms, ['new-co', 'CO_ALARM']];
  poll();
  assert.deepEqual((await co)[0], { device, tokens: { new_count: 1, observed_at: new Date(now).toISOString() } });

  const fire = once(flowEvents, 'homelink_fire_reported');
  now += 300_000;
  alarms = [['new-fire', 'FIRE_ALARM'], ['new-co', 'CO_ALARM'], ['repeat', 'CO_ALARM'], ['repeat', 'CO_ALARM']];
  poll();
  assert.deepEqual((await fire)[0], { device, tokens: { new_count: 1, observed_at: new Date(now).toISOString() } });
  assert.deepEqual(triggers.slice(2).map(({ id }) => id), ['homelink_co_reported', 'homelink_fire_reported', 'homelink_co_reported']);

  const invalid = once(events, 'homelink_maintenance_retrieved_at');
  now += 300_000;
  alarms = [['invalid', 'CO_ALARM', 'FIRE_ALARM']];
  poll();
  await invalid;
  const afterInvalid = once(events, 'homelink_maintenance_retrieved_at');
  now += 300_000;
  alarms = [['after-invalid', 'FIRE_ALARM']];
  poll();
  await afterInvalid;
  assert.equal(triggers.length, 5);

  preview = false;
  settings.emit('unset', 'homelink_alarm_flow_preview');
  assert.equal(app.alarmPreviewSince, null);
  const afterDisable = once(events, 'homelink_maintenance_retrieved_at');
  now += 300_000;
  alarms = [['disabled', 'FIRE_ALARM'], ['disabled-co', 'CO_ALARM']];
  poll();
  await afterDisable;
  assert.equal(triggers.length, 5);

  const unavailable = once(events, 'unavailable');
  credentials = undefined;
  settings.emit('unset', 'homelink_web_api');
  assert.match((await unavailable)[0], /Add HomeLINK Web API credentials/);
  assert.equal(available, false);
  await assert.rejects(replacementDue({ device, days: 2 }), /recent HomeLINK inventory update/);
  await assert.rejects(testReminder({ device, days: 1 }), /recent HomeLINK inventory update/);
  await assert.rejects(driver.onPairListDevices(), /Add HomeLINK Web API credentials/);
});

test('connection checks reject a candidate without replacing saved access', async (t) => {
  const api = require('../api');
  const manifest = require('../.homeycompose/app.json');
  const settings = new EventEmitter();
  const saved = { clientId: 'saved-id', clientSecret: 'saved-secret' };
  settings.get = (key) => key === 'homelink_web_api' ? saved : undefined;
  settings.set = t.mock.fn();
  const homey = { settings, setInterval: t.mock.fn(), clearInterval: t.mock.fn() };
  const App = loadAdapter('../app', 'App', FakeHomeyObject);
  const app = new App(homey);
  homey.app = app;
  assert.deepEqual(manifest.api.checkConnection, { method: 'POST', path: '/connection/check', public: false });
  assert.deepEqual(manifest.api.getConnectionStatus, { method: 'GET', path: '/connection', public: false });
  let now = 0;
  t.mock.method(Date, 'now', () => now);
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    const parsed = new URL(url);
    const clientId = parsed.searchParams.get('client');
    if (clientId === 'rate-limit') {
      return Response.json({}, { status: 429, headers: { 'Retry-After': '120' } });
    }
    if (clientId === 'bad-id') return Response.json({ error: 'SYNTHETIC-VENDOR-SECRET' }, { status: 403 });
    if (clientId) return Response.json({ accessToken: clientId });
    const model = options.headers.Authorization === 'Bearer saved-id' ? 'Ei3030' : 'Ei3028';
    return Response.json({ results: [{ model, serialNumber: 'SYNTHETIC-PRIVATE-SERIAL' }] });
  });
  app.onInit();
  t.after(() => app.onUninit());
  assert.deepEqual(await api.getConnectionStatus({ homey }), { state: 'waiting' });

  const candidate = (clientId) => api.checkConnection({ homey, body: { clientId, clientSecret: 'candidate-secret' } });
  await assert.rejects(candidate('bad-id'), { message: 'HomeLINK denied access. Check the Web API credentials and scope.' });
  const check = await candidate('candidate-id');
  assert.deepEqual(check.summary.models, [{ model: 'Ei3028', count: 1, pairable: true }]);
  assert.doesNotMatch(JSON.stringify(check), /candidate-secret|SYNTHETIC-PRIVATE-SERIAL/);
  assert.deepEqual(await api.getConnectionStatus({ homey }), { state: 'waiting' });
  assert.equal(settings.set.mock.callCount(), 0);

  await assert.rejects(candidate('rate-limit'), /rate limited/);
  const attempts = fetch.mock.callCount();
  now += 119_999;
  await assert.rejects(candidate('candidate-id'), /rate limited/);
  assert.equal(fetch.mock.callCount(), attempts);
  now += 1;
  const savedInventory = await app.discover();
  assert.deepEqual([...savedInventory.devices.values()].map((row) => row.model), ['Ei3030']);
  assert.equal((await api.getConnectionStatus({ homey })).state, 'available');
  now += 180_001;
  assert.deepEqual(await api.getConnectionStatus({ homey }), { state: 'stale', fetchedAt: 120_000 });
});
