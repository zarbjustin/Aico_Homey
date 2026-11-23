'use strict';

const ALARM_KINDS = Object.freeze(['fire', 'co']);
const FIRE_ONLY = Object.freeze(['fire']);
const NO_ALARMS = Object.freeze([]);

const entries = [
  { model: 'Ei1000G', pairable: true },
  { model: 'Ei3014', pairable: true, alarms: FIRE_ONLY },
  { model: 'Ei3016', pairable: true, alarms: FIRE_ONLY },
  { model: 'Ei3028', pairable: true, alarms: ALARM_KINDS },
  { model: 'Ei3030', pairable: true, alarms: ALARM_KINDS },
  { model: 'Ei450', pairable: true },
  { model: 'Ei3018' },
  { model: 'Ei3024' },
  { model: 'Ei208WRF' },
  { model: 'Ei208W' },
  { model: 'Ei1020' },
  { model: 'Ei1025' },
  { model: 'Ei1030' },
  { model: 'Ei630iRF' },
  { model: 'Ei650iRF' },
  { model: 'Ei660iRF' },
  { model: 'Ei2110e' },
  { model: 'Ei414' },
  { model: 'Ei428' },
];

const PROFILES = new Map(entries.map(({ model, pairable = false, alarms = NO_ALARMS }) => [
  model.toUpperCase(), Object.freeze({ model, pairable, alarms }),
]));

function profileFor(model) {
  if (typeof model !== 'string') return undefined;
  return PROFILES.get(model.trim().toUpperCase());
}

module.exports = { ALARM_KINDS, profileFor };
