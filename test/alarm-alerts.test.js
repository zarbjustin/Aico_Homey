'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { activeAlarmsByDevice } = require('../lib/alarm-alerts');
const { profileFor } = require('../lib/device-profiles');
const { deviceId } = require('../lib/identity');

const HOME = 'SYNTHETIC-HOME';
const LOBBY = 'SYNTHETIC-LOBBY';
const KITCHEN = 'SYNTHETIC-KITCHEN';

function alarm(id, eventType, serialNumber = LOBBY, options = {}) {
  return {
    id,
    eventType,
    serialNumber,
    category: 'ALARM',
    type: 'DEVICE',
    status: 'ACTIVE',
    propertyReference: HOME,
    _rel: { device: 'device/' + serialNumber, property: 'property/' + HOME },
    ...options,
  };
}

test('separates fire and carbon monoxide by paired device and deduplicates reports', () => {
  const fire = alarm('fire-1', 'FIRE_ALARM');
  const result = activeAlarmsByDevice([
    fire, fire,
    alarm('co-1', 'CO_ALARM', KITCHEN),
    alarm('resolved', 'FIRE_ALARM', LOBBY, { status: 'RESOLVED' }),
    alarm('co2', 'CO2_HIGH', KITCHEN, { category: 'INSIGHT' }),
    alarm('property-wide', 'FIRE_ALARM', LOBBY, { type: 'PROPERTY', serialNumber: null }),
  ], HOME);
  assert.deepEqual(result.get(deviceId(LOBBY)), new Map([['fire', new Set(['fire-1'])]]));
  assert.deepEqual(result.get(deviceId(KITCHEN)), new Map([['co', new Set(['co-1'])]]));
});

test('rejects ambiguous codes, inconsistent identities and mixed duplicates', () => {
  const fire = alarm('fire-1', 'FIRE_ALARM');
  for (const row of [
    { ...fire, eventType: 'FIRE_UNKNOWN' },
    { ...fire, eventTypeId: 'CO_ALARM' },
    { ...fire, propertyReference: 'ANOTHER-HOME' },
    { ...fire, serialNumber: KITCHEN },
    { ...fire, status: 'UNKNOWN' },
  ]) assert.throws(() => activeAlarmsByDevice([row], HOME));
  assert.throws(() => activeAlarmsByDevice([fire, { ...fire, eventType: 'CO_ALARM' }], HOME), /conflicting/);
});

test('checks product capability before routing cloud alarm reports', () => {
  assert.deepEqual(profileFor('Ei3030').alarms, ['fire', 'co']);
  assert.deepEqual(profileFor('Ei3028').alarms, ['fire', 'co']);
  assert.deepEqual(profileFor('Ei3016').alarms, ['fire']);
  assert.deepEqual(profileFor('Ei1000G').alarms, []);
  assert.deepEqual(profileFor('Ei208WRF').alarms, []);
});
