'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { deviceId } = require('../lib/identity');
const { normalizeInventory } = require('../lib/inventory');
const { activeMaintenanceByDevice } = require('../lib/maintenance');

const property = 'SYNTHETIC-HOME';
const serial = 'SYNTHETIC-ALARM';
const sample = {
  id: 'synthetic-event-1',
  type: 'DEVICE',
  status: 'ACTIVE',
  eventType: 'HEAD_REMOVED',
  category: 'PRIORITY_MAINTENANCE',
  serialNumber: serial,
  propertyReference: property,
  _rel: { device: 'device/synthetic-alarm', property: 'property/' + property },
};

test('counts verified active maintenance and faults once per event and device', () => {
  const second = 'SYNTHETIC-ALARM-2';
  const records = activeMaintenanceByDevice([
    sample,
    { ...sample, serialNumber: 'synthetic-alarm' },
    { ...sample, id: 'fault-1', category: 'FAULT', eventType: 'SYNTHETIC_FAULT' },
    { ...sample, id: 'mains-1', category: 'MAINTENANCE', eventType: 'MAINS_ABSENT',
      serialNumber: second, _rel: { ...sample._rel, device: 'device/' + second } },
    { ...sample, id: 'resolved-1', status: 'RESOLVED' },
    { ...sample, id: 'fire-1', category: 'ALARM', eventType: 'FIRE_ALARM' },
    { ...sample, id: 'co-1', category: 'ALARM', eventType: 'CO_ALARM' },
    { ...sample, id: 'property-1', type: 'PROPERTY', serialNumber: null },
  ], property);
  assert.deepEqual(records.get(deviceId(serial)), new Set(['synthetic-event-1', 'fault-1']));
  assert.deepEqual(records.get(deviceId(second)), new Set(['mains-1']));
});

test('treats ambiguous maintenance rows as unknown instead of reporting zero', () => {
  for (const row of [
    { ...sample, status: 'UNKNOWN' },
    { ...sample, _rel: { ...sample._rel, device: 'device/WRONG-DEVICE' } },
    { ...sample, propertyReference: 'OTHER-PROPERTY' },
    { ...sample, _rel: { ...sample._rel, property: 'property/OTHER-PROPERTY' } },
    { ...sample, id: '' },
  ]) assert.throws(() => activeMaintenanceByDevice([row], property), /ambiguous/);
  assert.throws(() => activeMaintenanceByDevice([sample, { ...sample, status: 'RESOLVED' }], property), /conflicting alerts/);
});

test('preserves the paired identity when discovering property references', () => {
  const row = { model: 'Ei3030', serialNumber: serial };
  const original = normalizeInventory([row]).get(deviceId(serial));
  const linked = normalizeInventory([{ ...row, _rel: { property: 'property/' + property } }]).get(original.id);
  const unsafe = normalizeInventory([{ ...row, _rel: { property: 'property/../other' } }]).get(original.id);
  assert.equal(original.propertyReference, undefined);
  assert.equal(linked.propertyReference, property);
  assert.equal(unsafe.propertyReference, undefined);
});
