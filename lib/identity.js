'use strict';

const { createHash } = require('node:crypto');

function isPropertyReference(reference) {
  return typeof reference === 'string' &&
    /^[A-Za-z0-9._-]{1,128}$/.test(reference) &&
    !['.', '..'].includes(reference);
}

function propertyReferenceFromLink(link) {
  const reference = typeof link === 'string' ? /^property\/(.+)$/.exec(link)?.[1] : undefined;
  return isPropertyReference(reference) ? reference : undefined;
}

function deviceId(serial) {
  if (typeof serial !== 'string' || !serial.trim()) return undefined;
  return createHash('sha256').update(serial.trim().toUpperCase()).digest('hex');
}

module.exports = { deviceId, isPropertyReference, propertyReferenceFromLink };
