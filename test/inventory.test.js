'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { normalizeInventory, summarizeInventory } = require('../lib/inventory');

const sample = {
  serialNumber: 'SYNTHETIC-ABC',
  model: 'Ei3030',
  location: 'TEST ROOM',
  locationNickname: 'Example room',
  replaceDate: '2035-09-03T00:00:00Z',
  status: { operationalStatus: 'GOOD', dataCollectionStatus: 'ACTIVE', lastTestedDate: '2026-02-03' },
  metadata: { lastSeenDate: '2026-02-09T12:34:56.789Z' },
};

test('discovers the supported models and keeps identities stable across label changes', () => {
  const [first] = normalizeInventory([sample]).values();
  const [second] = normalizeInventory([{
    ...sample, serialNumber: ' synthetic-abc ', model: ' EI3030 ', locationNickname: null,
  }]).values();
  assert.equal(first.id, second.id);
  assert.match(first.id, /^[a-f0-9]{64}$/);
  assert.equal(first.name, 'Ei3030 · Example room');
  assert.equal(second.name, 'Ei3030 · TEST ROOM');
  assert.deepEqual(first.values, {
    homelink_operational_status: 'Good',
    homelink_collection_status: 'Active',
    homelink_last_seen: '2026-02-09T12:34:56.789Z',
    homelink_last_tested: '2026-02-03',
    homelink_replace_by: '2035-09-03T00:00:00Z',
  });
});

test('keeps unknown status values and invalid dates unknown', () => {
  const [record] = normalizeInventory([{
    ...sample,
    status: { operationalStatus: '__proto__', dataCollectionStatus: 'OTHER', lastTestedDate: '2026-02-31' },
    replaceDate: 'garbage',
    metadata: null,
  }]).values();
  assert.deepEqual(Object.values(record.values), Array(5).fill('Unknown'));
});

test('recognises reported attention and inactive collection without inferring an alarm', () => {
  const [record] = normalizeInventory([{
    ...sample, status: { operationalStatus: 'NOT_GOOD', dataCollectionStatus: 'INACTIVE' },
  }]).values();
  assert.equal(record.values.homelink_operational_status, 'Attention required');
  assert.equal(record.values.homelink_collection_status, 'Inactive');
});

test('leaves unverified models and modules out of pairing', () => {
  const records = normalizeInventory([
    sample,
    { serialNumber: 'SYNTHETIC-GW', model: 'Ei1000G' },
    { serialNumber: 'SYNTHETIC-CO', model: 'Ei208WRF' },
    { serialNumber: 'SYNTHETIC-RF', model: 'Ei3000MRF' },
    null,
  ]);
  assert.deepEqual(Array.from(records.values(), (record) => record.model), ['Ei3030', 'Ei1000G']);
});

test('fails discovery for missing or duplicate supported-device identities', () => {
  assert.throws(() => normalizeInventory([{ ...sample, serialNumber: '' }]), /without an identifier/);
  assert.throws(() => normalizeInventory([sample, { ...sample, serialNumber: 'synthetic-abc' }]), /duplicate/);
});

test('pairs only COALARM records for Ei3018 and diagnoses mixed model types', () => {
  const rows = [
    { model: 'Ei3018', modelType: 'COALARM', serialNumber: 'SYNTHETIC-CO' },
    { model: 'Ei3018', modelType: 'FIREALARM', serialNumber: 'SYNTHETIC-MISMATCH' },
    { model: 'Ei3018', serialNumber: 'SYNTHETIC-MISSING-TYPE' },
    { model: 'Ei3024', modelType: 'FIREALARM', serialNumber: 'SYNTHETIC-UNVERIFIED' },
  ];
  const devices = normalizeInventory(rows);
  assert.deepEqual(Array.from(devices.values(), (record) => record.model), ['Ei3018']);
  assert.deepEqual(summarizeInventory(rows, devices).models, [
    { model: 'Ei3018', count: 3, pairable: true, pairableCount: 1 },
    { model: 'Ei3024', count: 1, pairable: false, pairableCount: 0 },
  ]);
});

test('diagnostics expose canonical model names and counts without household identifiers', () => {
  const property = { property: 'property/SYNTHETIC-PRIVATE-REFERENCE' };
  const rows = [
    { model: ' ei3030 ', serialNumber: 'SYNTHETIC-SERIAL', locationNickname: 'SYNTHETIC-PRIVATE-ROOM', _rel: property },
    { model: 'EI208WRF', serialNumber: 'SYNTHETIC-CANDIDATE', _rel: property },
    { model: 'SYNTHETIC-PRIVATE-UNKNOWN', serialNumber: 'SYNTHETIC-OTHER', _rel: property },
    null,
  ];
  const summary = summarizeInventory(rows, normalizeInventory(rows));
  assert.deepEqual(summary, {
    records: 4, pairable: 1, linkedProperties: 1, unknown: 1, missingModel: 1,
    models: [
      { model: 'Ei208WRF', count: 1, pairable: false, pairableCount: 0 },
      { model: 'Ei3030', count: 1, pairable: true, pairableCount: 1 },
    ],
  });
  assert.doesNotMatch(JSON.stringify(summary), /SYNTHETIC/);
});
