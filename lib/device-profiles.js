'use strict';

const ALARM_KINDS = Object.freeze(['fire', 'co']);
const FIRE_ONLY = Object.freeze(['fire']);
const CO_ONLY = Object.freeze(['co']);
const NO_ALARMS = Object.freeze([]);
const NO_READINGS = Object.freeze([]);
const INDOOR_CLIMATE = Object.freeze(['measure_temperature', 'measure_humidity']);
const INDOOR_AIR = Object.freeze([...INDOOR_CLIMATE, 'measure_co2']);

const entries = [
  { model: 'Ei1000G', pairable: true },
  { model: 'Ei3014', pairable: true, alarms: FIRE_ONLY },
  { model: 'Ei3016', pairable: true, alarms: FIRE_ONLY },
  { model: 'Ei3028', pairable: true, alarms: ALARM_KINDS },
  { model: 'Ei3030', pairable: true, alarms: ALARM_KINDS },
  { model: 'Ei450', pairable: true },
  { model: 'Ei3018', pairable: true, modelType: 'COALARM', alarms: CO_ONLY },
  { model: 'Ei3024' },
  { model: 'Ei208WRF' },
  { model: 'Ei208W' },
  { model: 'Ei1020', pairable: true, modelType: 'ENVSENSOR', environmental: INDOOR_CLIMATE },
  { model: 'Ei1025', pairable: true, modelType: 'ENVCO2SENSOR', environmental: INDOOR_AIR },
  { model: 'Ei1030' },
  { model: 'Ei630iRF' },
  { model: 'Ei650iRF' },
  { model: 'Ei660iRF' },
  { model: 'Ei2110e' },
  { model: 'Ei414' },
  { model: 'Ei428' },
];

const PROFILES = new Map(entries.map(({ model, pairable = false, modelType, alarms = NO_ALARMS, environmental = NO_READINGS }) => [
  model.toUpperCase(), Object.freeze({ model, pairable, modelType, alarms, environmental }),
]));

function profileFor(model) {
  if (typeof model !== 'string') return undefined;
  return PROFILES.get(model.trim().toUpperCase());
}

function isPairable(profile, row) {
  return Boolean(profile?.pairable && (profile.modelType === undefined || row.modelType === profile.modelType));
}

module.exports = { ALARM_KINDS, profileFor, isPairable };
