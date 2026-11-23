'use strict';

const { collectDeviceAlerts } = require('./device-alerts');

const ALARM_KINDS = ['fire', 'co'];
const CATEGORY = new Set(['ALARM']);
const EVENT_KIND = new Map([['FIRE_ALARM', 'fire'], ['CO_ALARM', 'co']]);
const KINDS_BY_MODEL = new Map([
  ['Ei3014', ['fire']],
  ['Ei3016', ['fire']],
  ['Ei3028', ALARM_KINDS],
  ['Ei3030', ALARM_KINDS],
]);

function alarmKindsForModel(model) {
  return KINDS_BY_MODEL.get(model) ?? [];
}

function activeAlarmsByDevice(rows, reference) {
  const events = collectDeviceAlerts(rows, reference, CATEGORY, (row) => {
    if (!EVENT_KIND.has(row.eventType) ||
      (row.eventTypeId !== undefined && row.eventTypeId !== row.eventType)) {
      throw new Error('HomeLINK returned an unrecognised or conflicting alarm code.');
    }
  });

  const devices = new Map();
  for (const [id, { device, status, eventType }] of events) {
    if (status !== 'ACTIVE') continue;
    const kind = EVENT_KIND.get(eventType);
    const alarms = devices.get(device) ?? new Map();
    const active = alarms.get(kind) ?? new Set();
    active.add(id);
    alarms.set(kind, active);
    devices.set(device, alarms);
  }
  return devices;
}

module.exports = { ALARM_KINDS, activeAlarmsByDevice, alarmKindsForModel };
