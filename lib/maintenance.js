'use strict';

const { deviceId, propertyReferenceFromLink } = require('./identity');

const CATEGORY = new Set(['MAINTENANCE', 'PRIORITY_MAINTENANCE', 'FAULT']);

function countActiveMaintenance(rows, reference) {
  const events = new Map();

  for (const row of rows) {
    if (typeof row?.category !== 'string') throw new Error('HomeLINK returned an invalid alert.');
    if (!CATEGORY.has(row.category)) continue;
    if (row.type === 'PROPERTY' || row.type === 'INSIGHT') continue;

    const device = deviceId(row.serialNumber);
    const deviceLink = typeof row._rel?.device === 'string' && /^device\/(.+)$/.exec(row._rel.device);
    if (row.type !== 'DEVICE' || !['ACTIVE', 'RESOLVED'].includes(row.status) || !device ||
      device !== deviceId(deviceLink?.[1]) || row.propertyReference !== reference ||
      propertyReferenceFromLink(row._rel?.property) !== reference ||
      typeof row.id !== 'string' || !row.id.trim() || typeof row.eventType !== 'string' || !row.eventType) {
      throw new Error('HomeLINK returned a maintenance alert with ambiguous state or identity.');
    }

    const existing = events.get(row.id);
    if (existing && (existing.device !== device || existing.category !== row.category ||
      existing.eventType !== row.eventType || existing.status !== row.status)) {
      throw new Error('HomeLINK returned conflicting alerts with the same identifier.');
    }
    events.set(row.id, { device, category: row.category, eventType: row.eventType, status: row.status });
  }

  const counts = new Map();
  for (const { device, status } of events.values()) {
    if (status === 'ACTIVE') counts.set(device, (counts.get(device) ?? 0) + 1);
  }
  return counts;
}

module.exports = { countActiveMaintenance };
