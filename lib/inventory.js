'use strict';

const { deviceId, propertyReferenceFromLink } = require('./identity');

const { profileFor } = require('./device-profiles');
const { reportedDate } = require('./service-dates');

const OPERATIONAL_STATUS = new Map([
  ['GOOD', 'Good'],
  ['NOT_GOOD', 'Attention required'],
]);
const COLLECTION_STATUS = new Map([
  ['ACTIVE', 'Active'],
  ['INACTIVE', 'Inactive'],
]);

function normalizeInventory(rows) {
  const devices = new Map();

  for (const row of rows) {
    const profile = profileFor(row?.model);
    if (!profile?.pairable) continue;
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
    const { model, pairable } = profile;
    const count = (counts.get(model)?.count ?? 0) + 1;
    counts.set(model, { model, count, pairable });
  }

  return {
    records: rows.length,
    pairable: devices.size,
    linkedProperties: properties.size,
    unknown,
    missingModel,
    models: Array.from(counts.values()).sort((a, b) => a.model.localeCompare(b.model)),
  };
}

module.exports = { normalizeInventory, summarizeInventory };
