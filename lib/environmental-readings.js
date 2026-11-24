'use strict';

const { deviceId, propertyReferenceFromLink } = require('./identity');
const { reportedDate } = require('./service-dates');

const READING_REFRESH_MS = 5 * 60_000;
const READING_MAX_AGE_MS = 60 * 60_000;
const SERIES = new Map([
  ['environment-temperature-indoor', { capability: 'measure_temperature', link: 'temperatureReadings', unit: 'celsius', min: -273.15, max: 100 }],
  ['environment-humidity-indoor', { capability: 'measure_humidity', link: 'humidityReadings', unit: 'rh %', min: 0, max: 100 }],
  ['environment-co2-indoor', { capability: 'measure_co2', link: 'co2Readings', unit: 'ppm', min: 0, max: 1_000_000 }],
]);
const LINK_NAMES = new Map(Array.from(SERIES.values(), ({ capability, link }) => [capability, link]));
const READING_TIMESTAMP = 'homelink_readings_sampled_at';

function hasReadingLinks(links, capabilities) {
  return capabilities.some((capability) => {
    const link = links?.[LINK_NAMES.get(capability)];
    return typeof link === 'string' && link.length > 0;
  });
}

function isRecentReading(sampledAt, now) {
  return Number.isFinite(sampledAt) && sampledAt <= now && now - sampledAt <= READING_MAX_AGE_MS;
}

function collectReadings(payload, reference, date, now, devices) {
  if (!Array.isArray(payload)) throw new Error('HomeLINK returned an invalid environmental reading list.');
  for (const series of payload) {
    const definition = SERIES.get(series?.type);
    if (!definition || series.unit !== definition.unit || !Array.isArray(series.devices)) continue;
    for (const device of series.devices) {
      const id = deviceId(device?.serialNumber);
      const linked = typeof device?._rel?.device === 'string' && /^device\/(.+)$/.exec(device._rel.device)?.[1];
      if (!id || id !== deviceId(linked) || propertyReferenceFromLink(device._rel?.property) !== reference ||
          !Array.isArray(device.values) || device.count !== device.values.length) continue;

      const readings = devices.get(id) ?? new Map();
      for (const row of device.values) {
        const value = row?.value;
        const timestamp = reportedDate(row?.readingDate);
        if (!Number.isFinite(value) || value < definition.min || value > definition.max ||
            timestamp.length <= 10 || timestamp.slice(0, 10) !== date) continue;
        const sampledAt = Date.parse(timestamp);
        if (!isRecentReading(sampledAt, now)) continue;
        const current = readings.get(definition.capability);
        if (!current || sampledAt > current.sampledAt) {
          readings.set(definition.capability, { value, sampledAt });
        } else if (sampledAt === current.sampledAt && value !== current.value) {
          readings.set(definition.capability, { value: null, sampledAt });
        }
      }
      devices.set(id, readings);
    }
  }
}

function readingCapabilities(readings, capabilities, now = Date.now()) {
  const values = {};
  let oldest = Infinity;
  for (const capability of capabilities) {
    const sample = readings?.get(capability);
    const value = isRecentReading(sample?.sampledAt, now) ? sample.value : null;
    values[capability] = value;
    if (value !== null) oldest = Math.min(oldest, sample.sampledAt);
  }
  values[READING_TIMESTAMP] = Number.isFinite(oldest) ? new Date(oldest).toISOString() : 'Unknown';
  return values;
}

module.exports = {
  READING_TIMESTAMP, READING_MAX_AGE_MS, READING_REFRESH_MS, hasReadingLinks, collectReadings, readingCapabilities,
};
