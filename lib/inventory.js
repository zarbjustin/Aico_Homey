'use strict';

const { deviceId, propertyReferenceFromLink } = require('./identity');

const MODELS = new Map([
  ['EI1000G', 'Ei1000G'],
  ['EI3014', 'Ei3014'],
  ['EI3016', 'Ei3016'],
  ['EI3028', 'Ei3028'],
  ['EI3030', 'Ei3030'],
  ['EI450', 'Ei450'],
]);

const OPERATIONAL_STATUS = new Map([
  ['GOOD', 'Good'],
  ['NOT_GOOD', 'Attention required'],
]);
const COLLECTION_STATUS = new Map([
  ['ACTIVE', 'Active'],
  ['INACTIVE', 'Inactive'],
]);

function candidate(row) {
  return typeof row?.model === 'string' && MODELS.has(row.model.trim().toUpperCase());
}

function reportedDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z)?$/.test(value)) return 'Unknown';
  const time = new Date(value);
  if (!Number.isFinite(time.valueOf()) || time.toISOString().slice(0, 10) !== value.slice(0, 10)) {
    return 'Unknown';
  }
  return value.length === 10 ? value : time.toISOString().replace('.000Z', 'Z');
}

function normalizeInventory(rows) {
  const devices = new Map();

  for (const row of rows.filter(candidate)) {
    const id = deviceId(row.serialNumber);
    if (!id) {
      throw new Error('HomeLINK returned a device without an identifier.');
    }
    if (devices.has(id)) throw new Error('HomeLINK returned duplicate device identifiers.');

    const model = MODELS.get(row.model.trim().toUpperCase());
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

module.exports = { normalizeInventory };
