'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { FakeHomeyObject, loadAdapter } = require('./load-homey-adapter');
const { HomeLinkMqtt, readMqttCredentials } = require('../lib/homelink-mqtt');
const { deviceId } = require('../lib/identity');
const flowManifest = require('../drivers/homelink-device/driver.flow.compose.json');

const NORTH = 'SYNTHETIC-NORTH';
const SOUTH = 'SYNTHETIC-SOUTH';
const PREVIEW = 'homelink_alarm_flow_preview';
const devices = {
  gateway: { property: NORTH, model: 'Ei1000G', modelType: 'GATEWAY' },
  fire: { property: NORTH, model: 'Ei3016', modelType: 'FIREALARM' },
  co: { property: NORTH, model: 'Ei3018', modelType: 'COALARM' },
  air: { property: NORTH, model: 'Ei1025', modelType: 'ENVCO2SENSOR', readings: true },
  combined: { property: SOUTH, model: 'Ei3030', modelType: 'FIRECOALARM' },
  climate: { property: SOUTH, model: 'Ei1020', modelType: 'ENVSENSOR', readings: true },
};

const serial = (name) => 'SYNTHETIC-' + name.toUpperCase();
const links = (name, property) => ({ device: 'device/' + serial(name), property: 'property/' + property });

function alert(name, id, eventType, category = 'ALARM') {
  const { property } = devices[name];
  return {
    id, type: 'DEVICE', category, eventType, status: 'ACTIVE', serialNumber: serial(name),
    propertyReference: property, _rel: links(name, property),
  };
}

function temperature(name, property, time, value) {
  return { serialNumber: serial(name), _rel: links(name, property), count: 1, values: [{ value, readingDate: time }] };
}

function createHousehold(t) {
  let now = Date.parse('2031-04-12T12:00:00Z');
  const settings = new EventEmitter();
  const saved = new Map([
    ['homelink_web_api', { clientId: 'synthetic-id', clientSecret: 'synthetic-secret' }],
    ['homelink_mqtt', { clientId: 'synthetic-mqtt', username: 'synthetic-user', password: 'synthetic-password', topicRoot: 'synthetic' }],
  ]);
  settings.get = (key) => saved.get(key);
  const cloud = {
    down: false, badReadingLink: false, sampleAt: new Date(now).toISOString(),
    alerts: new Map([[NORTH, [alert('fire', 'first-fire', 'FIRE_ALARM')]], [SOUTH, []]]),
    calls: [],
  };
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const { hostname, pathname, searchParams } = new URL(url);
    cloud.calls.push(pathname);
    if (hostname === 'auth.live.homelync.io') {
      assert.equal(pathname, '/oauth2');
      if (searchParams.get('client') !== 'synthetic-id') {
        return Response.json({ error: 'SYNTHETIC-UPSTREAM-DETAIL' }, { status: 403 });
      }
      return Response.json({ accessToken: 'synthetic-access-token' });
    }
    assert.equal(hostname, 'frontier.live.homelync.io');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-access-token');
    if (cloud.down) return new Response(null, { status: 503 });
    if (pathname === '/v1/device') {
      const results = Object.entries(devices).map(([name, device]) => ({
        ...device, serialNumber: serial(name), locationNickname: 'SYNTHETIC-ROOM-' + name,
        replaceDate: name === 'fire' ? '2031-04-12' : '2033-01-01',
        status: { operationalStatus: 'GOOD', lastTestedDate: '2031-04-01' },
        _rel: {
          ...links(name, device.property),
          readings: device.readings ? { temperatureReadings: 'device/' + serial(name) + '/readings/environment-temperature-indoor' } : undefined,
        },
      }));
      return Response.json({ count: results.length, page: 1, totalPages: 1, results });
    }
    const [, property, resource] = /^\/v1\/property\/([^/]+)\/(alerts|readings)$/.exec(pathname) ?? [];
    assert.ok(cloud.alerts.has(property), 'Unexpected request to ' + pathname);
    if (resource === 'alerts') {
      const results = cloud.alerts.get(property);
      return Response.json({ count: results.length, results });
    }
    if (searchParams.get('date') !== cloud.sampleAt.slice(0, 10)) return Response.json([]);
    const rows = property === NORTH
      ? [temperature('air', NORTH, cloud.sampleAt, 21)]
      : [temperature('climate', SOUTH, cloud.sampleAt, 17)];
    if (property === SOUTH && cloud.badReadingLink) rows.push(temperature('climate', NORTH, cloud.sampleAt, 99));
    return Response.json([{ type: 'environment-temperature-indoor', unit: 'celsius', devices: rows }]);
  });

  let broker;
  class SyntheticMqtt extends HomeLinkMqtt {
    constructor(credentials, onHint) {
      super(credentials, onHint, () => {
        broker = new EventEmitter();
        broker.subscribe = (topics, { qos }, callback) => callback(null, topics.map((topic) => ({ topic, qos })));
        broker.end = () => broker.emit('close');
        return broker;
      });
    }
  }
  const App = loadAdapter('../app', 'App', FakeHomeyObject, {
    './lib/homelink-mqtt': { HomeLinkMqtt: SyntheticMqtt, readMqttCredentials },
  });
  const Driver = loadAdapter('../drivers/homelink-device/driver', 'Driver');
  const Device = loadAdapter('../drivers/homelink-device/device', 'Device');
  const triggers = [];
  const conditions = new Map();
  const tiles = new Map();
  const storedCapabilities = new Map();
  const timers = new Map();
  let poll;
  const homey = {
    settings,
    setInterval(callback) { poll = callback; return callback; },
    clearInterval() { poll = undefined; },
    setTimeout(callback, delay) {
      const timer = Symbol();
      timers.set(timer, { callback, delay });
      return timer;
    },
    clearTimeout(timer) { timers.delete(timer); },
    clock: { getTimezone: () => 'Europe/London' },
    drivers: { getDriver: () => ({ getDevices: () => Array.from(tiles.values()) }) },
    flow: {
      getDeviceTriggerCard(id) {
        const card = flowManifest.triggers.find((entry) => entry.id === id);
        assert.ok(card);
        return { async trigger(device, tokens) {
          assert.deepEqual(Object.keys(tokens).sort(), card.tokens.map((token) => token.name).sort());
          triggers.push({ id, device: device.getData().id, tokens });
        } };
      },
      getConditionCard(id) {
        assert.ok(flowManifest.conditions.some((entry) => entry.id === id));
        return { registerRunListener: (listener) => conditions.set(id, listener) };
      },
    },
  };
  const settle = () => new Promise(setImmediate);

  async function start(previousPairs) {
    const app = new App(homey);
    homey.app = app;
    app.onInit();
    const driver = new Driver(homey);
    driver.onInit();
    const discovered = await driver.onPairListDevices();
    if (previousPairs) assert.deepEqual(discovered, previousPairs);
    const pairs = previousPairs ?? discovered;
    for (const pair of pairs) {
      const device = new Device(homey);
      device.driver = driver;
      const values = storedCapabilities.get(pair.data.id) ?? new Map();
      storedCapabilities.set(pair.data.id, values);
      let available = false;
      device.getData = () => pair.data;
      device.getAvailable = () => available;
      device.setAvailable = async () => { available = true; };
      device.setUnavailable = async () => { available = false; };
      device.hasCapability = (key) => values.has(key);
      device.addCapability = async (key) => { values.set(key, null); };
      device.getCapabilityValue = (key) => values.get(key);
      device.setCapabilityValue = async (key, value) => { values.set(key, value); };
      device.error = (message) => { assert.fail(message); };
      tiles.set(pair.data.id, device);
      await device.onInit();
    }
    await settle();
    return pairs;
  }

  function stop() {
    for (const device of tiles.values()) device.onUninit();
    tiles.clear();
    homey.app?.onUninit();
    homey.app = undefined;
  }
  t.after(stop);
  return {
    homey, cloud, triggers, conditions, start, stop, settle,
    id: (name) => deviceId(serial(name)),
    device: (name) => tiles.get(deviceId(serial(name))),
    setPreview(enabled) { saved.set(PREVIEW, enabled); settings.emit('set', PREVIEW); },
    async pollAfter(delay) { now += delay; poll(); await settle(); },
    connect() { broker.emit('connect'); },
    disconnect() { broker.emit('close'); },
    publish(packet = {}) { broker.emit('message', 'synthetic/alert/active/example', Buffer.from('untrusted'), packet); },
    pendingHints: () => timers.size,
    async applyHint() {
      assert.equal(timers.size, 1);
      const [[id, timer]] = timers;
      timers.delete(id);
      now += timer.delay;
      timer.callback();
      await settle();
    },
  };
}

module.exports = { NORTH, SOUTH, alert, createHousehold };
