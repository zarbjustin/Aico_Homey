'use strict';

const INVENTORY_STATES = new Map([
  ['unconfigured', 'Web API key not configured'],
  ['waiting', 'Waiting for the first read'],
  ['available', 'Available'],
  ['unavailable', 'Last read failed'],
  ['incomplete', 'Incomplete device list'],
  ['stale', 'Stale'],
]);
const MQTT_STATES = new Map([
  ['disabled', 'Disabled'],
  ['waiting', 'Waiting for Web API access and a paired device'],
  ['connecting', 'Connecting'],
  ['listening', 'Listening'],
  ['reconnecting', 'Reconnecting'],
  ['unavailable', 'Unavailable'],
]);

function formatTime(value, now) {
  return Number.isFinite(value) && value <= now ? new Date(value).toISOString() : 'Unavailable';
}

function coverage(usable, expected) {
  if (!expected) return 'No applicable devices paired';
  return usable + '/' + expected + ' paired devices with usable data';
}

function createSupportReport({ version, now, inventoryState, mqttState, alarmPreview, devices, lastRead }) {
  let inventory = 0;
  let maintenance = 0;
  let environmental = 0;
  let environmentalTotal = 0;
  for (const device of devices) {
    if (device.inventory) inventory += 1;
    if (device.maintenance) maintenance += 1;
    if (device.environmental !== null) environmentalTotal += 1;
    if (device.environmental) environmental += 1;
  }
  return [
    'Aico HomeLINK support report',
    'App version ' + version,
    'Generated ' + formatTime(now, now),
    '',
    'Web API inventory — ' + (INVENTORY_STATES.get(inventoryState) ?? 'Unknown'),
    '  ' + coverage(inventory, devices.length),
    '  Last successful read ' + formatTime(lastRead.inventory, now),
    'Maintenance alerts — ' + coverage(maintenance, devices.length),
    '  Last successful read ' + formatTime(lastRead.maintenance, now),
    'Environmental readings — ' + coverage(environmental, environmentalTotal),
    '  Last successful read ' + formatTime(lastRead.environmental, now),
    'MQTT listener — ' + (MQTT_STATES.get(mqttState) ?? 'Unknown'),
    'Alarm Flow preview — ' + (alarmPreview ? 'Enabled' : 'Disabled'),
  ].join('\n');
}

module.exports = { createSupportReport };
