'use strict';

const { collectDeviceAlerts } = require('./device-alerts');

const CATEGORY = new Set(['MAINTENANCE', 'PRIORITY_MAINTENANCE', 'FAULT']);

function activeMaintenanceByDevice(rows, reference) {
  const events = collectDeviceAlerts(rows, reference, CATEGORY);
  const devices = new Map();
  for (const [id, { device, status }] of events) {
    if (status !== 'ACTIVE') continue;
    const active = devices.get(device) ?? new Set();
    active.add(id);
    devices.set(device, active);
  }
  return devices;
}

module.exports = { activeMaintenanceByDevice };
