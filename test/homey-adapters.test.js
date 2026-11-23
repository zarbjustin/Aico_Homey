'use strict';

const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const { test } = require('node:test');
const vm = require('node:vm');

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

test('pairs, refreshes and marks a paired tile unavailable when credentials are removed', async (t) => {
  const settings = new EventEmitter();
  let credentials = { clientId: 'test-id', clientSecret: 'test-secret' };
  settings.get = () => credentials;
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (new URL(url).hostname === 'auth.live.homelync.io') {
      return Response.json({ accessToken: 'synthetic' });
    }
    return Response.json({ results: [{
      model: 'Ei3030',
      serialNumber: 'SYNTHETIC-ADAPTER',
      status: { operationalStatus: 'GOOD' },
    }] });
  });

  const homey = { settings, setInterval: t.mock.fn(), clearInterval: t.mock.fn() };
  const App = loadAdapter('../app', 'App', FakeHomeyObject);
  const Driver = loadAdapter('../drivers/homelink-device/driver', 'Driver', FakeHomeyObject);
  const Device = loadAdapter('../drivers/homelink-device/device', 'Device', FakeHomeyObject);
  const app = new App(homey);
  homey.app = app;
  app.onInit();
  t.after(() => app.onUninit());

  const [pair] = await new Driver(homey).onPairListDevices();
  assert.equal(pair.name, 'Ei3030');
  assert.deepEqual(Object.keys(pair.data), ['id', 'model']);
  const device = new Device(homey);
  const events = new EventEmitter();
  const capabilities = new Map();
  let available = false;
  device.getData = () => pair.data;
  device.getAvailable = () => available;
  device.getCapabilityValue = (id) => capabilities.get(id);
  device.setCapabilityValue = async (id, value) => { capabilities.set(id, value); };
  device.setAvailable = async () => { available = true; events.emit('available'); };
  device.setUnavailable = async (message) => { available = false; events.emit('unavailable', message); };

  const updated = once(events, 'available');
  await device.onInit();
  await updated;
  assert.equal(capabilities.get('homelink_operational_status'), 'Good');
  assert.equal(capabilities.get('homelink_last_seen'), 'Unknown');
  assert.match(capabilities.get('homelink_retrieved_at'), /Z$/);
  assert.equal(globalThis.fetch.mock.callCount(), 2);

  const unavailable = once(events, 'unavailable');
  credentials = undefined;
  settings.emit('unset', 'homelink_web_api');
  assert.match((await unavailable)[0], /Add HomeLINK Web API credentials/);
  assert.equal(available, false);
  await assert.rejects(new Driver(homey).onPairListDevices(), /Add HomeLINK Web API credentials/);
});
