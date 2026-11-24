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

test('pairs Ei1025 only under its verified inventory type and records a readings link', () => {
  const row = { model: 'Ei1025', modelType: 'ENVCO2SENSOR', serialNumber: 'SYNTHETIC-ENV' };
  const [record] = normalizeInventory([{
    ...row, _rel: { readings: { co2Readings: 'device/SYNTHETIC-ENV/readings/environment-co2-indoor' } },
  }]).values();
  assert.equal(record.hasReadings, true);
  assert.equal([...normalizeInventory([row]).values()][0].hasReadings, false);
  assert.equal(normalizeInventory([{ ...row, modelType: 'FIREALARM' }]).size, 0);
  assert.equal(normalizeInventory([{ ...row, model: 'Ei1030' }]).size, 0);
  const [climate] = normalizeInventory([{
    ...row, model: 'Ei1020', modelType: 'ENVSENSOR',
    _rel: { readings: { temperatureReadings: 'device/SYNTHETIC-ENV/readings/environment-temperature-indoor' } },
  }]).values();
  assert.equal(climate.hasReadings, true);
  assert.equal(normalizeInventory([{ ...row, model: 'Ei1020' }]).size, 0);
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
  const { modelEvidence, ...totals } = summary;
  assert.equal(modelEvidence.length, 2);
  assert.deepEqual(totals, {
    records: 4, pairable: 1, linkedProperties: 1, unknown: 1, missingModel: 1,
    models: [
      { model: 'Ei208WRF', count: 1, pairable: false, pairableCount: 0 },
      { model: 'Ei3030', count: 1, pairable: true, pairableCount: 1 },
    ],
  });
  assert.doesNotMatch(JSON.stringify(summary), /SYNTHETIC/);
});

test('groups radio and accessory evidence while masking private values and preserving pairing eligibility', () => {
  const property = 'property/SYNTHETIC-PRIVATE-HOME';
  const rows = [
    {
      ...sample, model: 'Ei450', modelType: 'EIACCESSORY', serialNumber: 'SYNTHETIC-CONTROLLER',
      metadata: { ...sample.metadata, connectivityType: 'EIRF868' },
      _rel: { property, alerts: 'device/SYNTHETIC-PRIVATE-CONTROLLER/alerts' },
    },
    {
      model: 'ei208wrf', modelType: 'COALARM', serialNumber: 'SYNTHETIC-CANDIDATE',
      metadata: { connectivityType: 'EIRF868' },
      status: { operationalStatus: 'GOOD', lastTestedDate: '2026-02-31' },
      _rel: { property },
    },
    {
      model: 'Ei208WRF', modelType: 'COALARM', serialNumber: 'SYNTHETIC-CANDIDATE-SECOND',
      metadata: { connectivityType: 'EIRF868' },
    },
    {
      model: 'Ei208WRF', modelType: 'SYNTHETIC-PRIVATE-TYPE', serialNumber: 'SYNTHETIC-CANDIDATE-OTHER',
      metadata: { connectivityType: 'SYNTHETIC-PRIVATE-RADIO' },
      _rel: { property: 'property/../' },
    },
    { model: 'Ei208WRF', serialNumber: 'SYNTHETIC-CANDIDATE-MISSING' },
    { model: 'SYNTHETIC-UNKNOWN', modelType: 'COALARM', metadata: { connectivityType: 'EIRF868' } },
  ];
  const devices = normalizeInventory(rows);
  assert.deepEqual([...devices.values()].map(({ model }) => model), ['Ei450']);
  const summary = summarizeInventory(rows, devices);
  assert.deepEqual(summary.modelEvidence, [
    {
      model: 'Ei208WRF', modelType: 'COALARM', connectivity: 'EIRF868', records: 2, pairable: 0,
      propertyLinks: 1, operationalStatus: 1, collectionStatus: 0, lastSeen: 0, lastTested: 0, replacementDate: 0, alertLinks: 0,
    },
    {
      model: 'Ei208WRF', modelType: 'Missing', connectivity: 'Missing', records: 1, pairable: 0,
      propertyLinks: 0, operationalStatus: 0, collectionStatus: 0, lastSeen: 0, lastTested: 0, replacementDate: 0, alertLinks: 0,
    },
    {
      model: 'Ei208WRF', modelType: 'Other (masked)', connectivity: 'Other (masked)', records: 1, pairable: 0,
      propertyLinks: 0, operationalStatus: 0, collectionStatus: 0, lastSeen: 0, lastTested: 0, replacementDate: 0, alertLinks: 0,
    },
    {
      model: 'Ei450', modelType: 'EIACCESSORY', connectivity: 'EIRF868', records: 1, pairable: 1,
      propertyLinks: 1, operationalStatus: 1, collectionStatus: 1, lastSeen: 1, lastTested: 1, replacementDate: 1, alertLinks: 1,
    },
  ]);
  assert.doesNotMatch(JSON.stringify(summary), /SYNTHETIC|Example room|2035-09-03|2026-02-09|2026-02-03/i);
});
