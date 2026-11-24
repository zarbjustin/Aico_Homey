'use strict';

const { deviceId, propertyReferenceFromLink } = require('./identity');

const { profileFor, isPairable } = require('./device-profiles');
const { reportedDate } = require('./service-dates');
const { hasReadingLinks } = require('./environmental-readings');

const OPERATIONAL_STATUS = new Map([
  ['GOOD', 'Good'],
  ['NOT_GOOD', 'Attention required'],
]);
const COLLECTION_STATUS = new Map([
  ['ACTIVE', 'Active'],
  ['INACTIVE', 'Inactive'],
]);
const REPORTED_MODEL_TYPES = new Set([
  'GATEWAY', 'FIREALARM', 'COALARM', 'FIRECOALARM', 'EIACCESSORY', 'ENVSENSOR', 'ENVCO2SENSOR',
]);
const REPORTED_CONNECTIVITY_TYPES = new Set(['EIRF868', 'GSM']);

function reportedCode(value, codes) {
  if (value == null || (typeof value === 'string' && !value.trim())) return 'Missing';
  return codes.has(value) ? value : 'Other (masked)';
}

function addModelEvidence(evidence, row, model, property, pairable) {
  const modelType = reportedCode(row.modelType, REPORTED_MODEL_TYPES);
  const connectivity = reportedCode(row.metadata?.connectivityType, REPORTED_CONNECTIVITY_TYPES);
  const key = [model, modelType, connectivity].join('|');
  const group = evidence.get(key) ?? {
    model, modelType, connectivity,
    records: 0, pairable: 0, propertyLinks: 0, operationalStatus: 0, collectionStatus: 0,
    lastSeen: 0, lastTested: 0, replacementDate: 0, alertLinks: 0,
  };
  group.records += 1;
  if (pairable) group.pairable += 1;
  if (property) group.propertyLinks += 1;
  if (OPERATIONAL_STATUS.has(row.status?.operationalStatus)) group.operationalStatus += 1;
  if (COLLECTION_STATUS.has(row.status?.dataCollectionStatus)) group.collectionStatus += 1;
  if (reportedDate(row.metadata?.lastSeenDate) !== 'Unknown') group.lastSeen += 1;
  if (reportedDate(row.status?.lastTestedDate) !== 'Unknown') group.lastTested += 1;
  if (reportedDate(row.replaceDate) !== 'Unknown') group.replacementDate += 1;
  if (typeof row._rel?.alerts === 'string' && row._rel.alerts.trim()) group.alertLinks += 1;
  evidence.set(key, group);
}

function normalizeInventory(rows) {
  const devices = new Map();

  for (const row of rows) {
    const profile = profileFor(row?.model);
    if (!isPairable(profile, row)) continue;
    const id = deviceId(row.serialNumber);
    if (!id) {
      throw new Error('HomeLINK returned a device without an identifier.');
    }
    if (devices.has(id)) throw new Error('HomeLINK returned duplicate device identifiers.');

    const { model } = profile;
    const room = [row.locationNickname, row.location].find((value) =>
      typeof value === 'string' && value.trim().length > 0);
    const name = room ? model + ' · ' + room.trim().replace(/\s+/g, ' ').slice(0, 64) : model;
    const status = row.status?.operationalStatus;
    const collection = row.status?.dataCollectionStatus;
    devices.set(id, {
      id,
      name,
      model,
      propertyReference: propertyReferenceFromLink(row._rel?.property),
      hasReadings: hasReadingLinks(row._rel?.readings, profile.environmental),
      values: {
        homelink_operational_status: OPERATIONAL_STATUS.get(status) ?? 'Unknown',
        homelink_collection_status: COLLECTION_STATUS.get(collection) ?? 'Unknown',
        homelink_last_seen: reportedDate(row.metadata?.lastSeenDate),
        homelink_last_tested: reportedDate(row.status?.lastTestedDate),
        homelink_replace_by: reportedDate(row.replaceDate),
      },
    });
  }
  return devices;
}

function summarizeInventory(rows, devices) {
  const properties = new Set();
  const counts = new Map();
  const evidence = new Map();
  let unknown = 0;
  let missingModel = 0;

  for (const row of rows) {
    const property = propertyReferenceFromLink(row?._rel?.property);
    if (property) properties.add(property);

    if (typeof row?.model !== 'string' || !row.model.trim()) {
      missingModel += 1;
      continue;
    }
    const profile = profileFor(row.model);
    if (!profile) {
      unknown += 1;
      continue;
    }
    const { model } = profile;
    const entry = counts.get(model) ?? { model, count: 0, pairable: false, pairableCount: 0 };
    entry.count += 1;
    const pairable = isPairable(profile, row);
    if (pairable) {
      entry.pairable = true;
      entry.pairableCount += 1;
    }
    counts.set(model, entry);
    addModelEvidence(evidence, row, model, property, pairable);
  }

  return {
    records: rows.length,
    pairable: devices.size,
    linkedProperties: properties.size,
    unknown,
    missingModel,
    models: Array.from(counts.values()).sort((a, b) => a.model.localeCompare(b.model)),
    modelEvidence: Array.from(evidence.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, group]) => group),
  };
}

module.exports = { normalizeInventory, summarizeInventory };
