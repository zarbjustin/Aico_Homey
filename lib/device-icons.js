'use strict';

const { readFileSync } = require('node:fs');
const path = require('node:path');

const icons = new Map([
  ['Ei1000G', '/icons/ei1000g.svg'],
  ['Ei1020', '/icons/environment-sensor.svg'],
  ['Ei1025', '/icons/environment-sensor.svg'],
  ['Ei3014', '/icons/ei3014.svg'],
  ['Ei3016', '/icons/ei3016.svg'],
  ['Ei3018', '/icons/ei3018.svg'],
  ['Ei3028', '/icons/ei3028.svg'],
  ['Ei3030', '/icons/ei3030.svg'],
  ['Ei450', '/icons/ei450.svg'],
]);

const assets = path.join(__dirname, '../drivers/homelink-device/assets');
const artwork = new Map();

function getDeviceIcon(model) {
  return icons.get(model) ?? '/icon.svg';
}

function getModelArtwork(models) {
  const result = {};
  for (const { model } of models) {
    const icon = icons.get(model);
    if (!icon) continue;
    if (!artwork.has(icon)) {
      artwork.set(icon, readFileSync(path.join(assets, icon)).toString('base64'));
    }
    result[model] = artwork.get(icon);
  }
  return result;
}

module.exports = { getDeviceIcon, getModelArtwork };
