'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { collectReadings, readingCapabilities } = require('../lib/environmental-readings');
const { HomeLinkClient } = require('../lib/homelink-client');
const { profileFor } = require('../lib/device-profiles');
const { deviceId } = require('../lib/identity');

const HOME = 'SYNTHETIC-HOME';
const SERIAL = 'SYNTHETIC-ENV';
const WHEN = '2026-11-24T00:20:00Z';
const NOW = Date.parse(WHEN);
const TODAY = '2026-11-24';
const PREVIOUS = '2026-11-23';
const EI1025 = profileFor('Ei1025').environmental;
const EI1020 = profileFor('Ei1020').environmental;

function series(type, unit, samples, overrides = {}) {
  return {
    type: 'environment-' + type + '-indoor',
    unit,
    devices: [{
      serialNumber: SERIAL,
      _rel: { property: 'property/' + HOME, device: 'device/' + SERIAL },
      count: samples.length,
      values: samples.map(([readingDate, value]) => ({ readingDate, value })),
      ...overrides,
    }],
  };
}

test('keeps units, identities, and recent samples separate without interpreting CO₂ as CO', () => {
  const devices = new Map();
  collectReadings([
    series('temperature', 'celsius', [
      ['2026-11-24T00:15:00Z', 21.5], ['2026-11-24T00:05:00Z', 19], ['2026-11-24T00:30:00Z', 60],
    ]),
    series('humidity', 'rh %', [['2026-11-24T00:12:00Z', 55], ['2026-11-24T00:19:00Z', 150]]),
    series('co2', 'ppm', [['2026-11-24T00:12:00Z', 802]], { count: 2 }),
    series('co2', 'ppm', [['2026-11-24T00:12:00Z', 802]], { _rel: { property: 'property/OTHER', device: 'device/' + SERIAL } }),
    series('co2', 'ppm', [['2026-11-24T00:12:00Z', 802]], { _rel: { property: 'property/' + HOME, device: 'device/OTHER' } }),
    series('co2', 'ppb', [['2026-11-24T00:17:00Z', 802]]),
    series('co', 'ppm', [['2026-11-24T00:17:00Z', 802]]),
  ], HOME, TODAY, NOW, devices);
  const samples = devices.get(deviceId(SERIAL));
  assert.deepEqual(readingCapabilities(samples, EI1025, NOW), {
    measure_temperature: 21.5, measure_humidity: 55, measure_co2: null,
    homelink_readings_sampled_at: '2026-11-24T00:12:00.000Z',
  });
  collectReadings([series('temperature', 'celsius', [['2026-11-24T00:15:00Z', 33]])], HOME, TODAY, NOW, devices);
  assert.equal(readingCapabilities(samples, EI1025, NOW).measure_temperature, null);
  assert.deepEqual(readingCapabilities(samples, EI1025, NOW + 3_600_000), {
    measure_temperature: null, measure_humidity: null, measure_co2: null, homelink_readings_sampled_at: 'Unknown',
  });
});

test('shares requests per property, uses the previous UTC date when needed and expires the cache', async () => {
  let now = NOW;
  const fetchedDates = [];
  const client = new HomeLinkClient({ clientId: 'synthetic', clientSecret: 'synthetic' }, {
    now: () => now,
    fetch: async (url) => {
      const { pathname, searchParams } = new URL(url);
      if (pathname === '/oauth2') return Response.json({ accessToken: 'synthetic' });
      assert.equal(pathname, '/v1/property/' + HOME + '/readings');
      const date = searchParams.get('date');
      fetchedDates.push(date);
      if (date === TODAY) return Response.json([]);
      return Response.json([series('co2', 'ppm', [['2026-11-23T23:58:00Z', 900], ['2026-11-23T22:00:00Z', 950]])]);
    },
  });
  const [first, shared] = await Promise.all([client.getPropertyReadings(HOME), client.getPropertyReadings(HOME)]);
  assert.equal(first, shared);
  const samples = first.byDevice.get(deviceId(SERIAL));
  assert.equal(readingCapabilities(samples, EI1025, NOW).measure_co2, 900);
  assert.equal(Object.hasOwn(readingCapabilities(samples, EI1020, NOW), 'measure_co2'), false);
  assert.deepEqual(fetchedDates, [TODAY, PREVIOUS]);
  now += 299_999;
  assert.equal(await client.getPropertyReadings(HOME), first);
  now += 1;
  assert.notEqual(await client.getPropertyReadings(HOME), first);
  assert.deepEqual(fetchedDates, [TODAY, PREVIOUS, TODAY, PREVIOUS]);
  await assert.rejects(client.getPropertyReadings('invalid/reference'), /invalid property/);
  client.close();
});
