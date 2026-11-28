'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { lastTestAtLeast, replacementDueWithin } = require('../lib/service-dates');
const { createDeviceDateFormatter } = require('../lib/device-detail-dates');

const london = 'Europe/London';

test('formats detail dates compactly using the Homey timezone and keeps calendar-only dates stable', () => {
  const now = Date.parse('2026-06-20T12:00:00Z');
  const local = createDeviceDateFormatter(now, london);
  assert.equal(local('2026-06-19T23:35:41.789Z'), '20 Jun 00:35');
  assert.equal(local('2026-03-29T01:35:00Z'), '29 Mar 02:35');
  assert.equal(local('2026-10-25T01:15:00Z'), '25 Oct 01:15');
  assert.equal(local('2025-12-30T12:00:00Z'), '30 Dec 2025');
  assert.equal(local('2026-02-03'), '3 Feb 2026');
  assert.equal(local('2026-02-31'), 'Unknown');
  assert.equal(local(undefined), 'Unknown');
  const california = createDeviceDateFormatter(now, 'America/Los_Angeles');
  assert.equal(california('2037-10-05T00:00:00Z', { dateOnly: true }), '5 Oct 2037');
  const missingZone = createDeviceDateFormatter(now, 'Invalid/Timezone');
  assert.equal(missingZone('2026-06-19T23:35:00Z'), '19 Jun 2026');
});

test('replacement window counts calendar days and includes today and overdue devices', () => {
  const now = Date.parse('2026-03-29T23:10:00.000Z');
  assert.equal(replacementDueWithin('2026-03-30', 0, now, london), true);
  assert.equal(replacementDueWithin('2026-03-31', 0, now, london), false);
  assert.equal(replacementDueWithin('2026-03-31', '1', now, london), true);
  assert.equal(replacementDueWithin('2026-03-29', 0, now, london), true);

  const losAngeles = 'America/Los_Angeles';
  const localPriorDay = Date.parse('2026-03-30T03:00:00.000Z');
  assert.equal(replacementDueWithin('2026-03-30T00:00:00Z', 0, localPriorDay, losAngeles), false);
  assert.equal(replacementDueWithin('2026-03-30T00:00:00Z', 1, localPriorDay, losAngeles), true);
});

test('last-test timestamps follow Homey local dates across spring and autumn clock changes', () => {
  const spring = Date.parse('2026-03-29T23:10:00.000Z');
  assert.equal(lastTestAtLeast('2026-03-29T23:05:00Z', 1, spring, london), false);
  assert.equal(lastTestAtLeast('2026-03-29T22:55:00Z', 1, spring, london), true);
  assert.equal(lastTestAtLeast('2026-03-29', 1, spring, london), true);

  const autumn = Date.parse('2026-10-26T00:10:00.000Z');
  assert.equal(lastTestAtLeast('2026-10-25T23:50:00Z', 1, autumn, london), true);
  assert.equal(lastTestAtLeast('2026-10-25T23:50:00Z', 2, autumn, london), false);
});

test('rejects missing, impossible or future service evidence and invalid thresholds', () => {
  const now = Date.parse('2028-02-29T12:00:00.000Z');
  assert.equal(lastTestAtLeast('2028-02-28', 1, now, london), true);
  assert.throws(() => lastTestAtLeast('2028-02-29T14:00:00Z', 1, now, london), /future/);
  assert.throws(() => lastTestAtLeast('2028-03-01', 1, now, london), /future/);
  assert.throws(() => lastTestAtLeast('Unknown', 1, now, london), /date is unavailable/);
  assert.throws(() => lastTestAtLeast('2028-02-28', 0, now, london), /whole number/);
  assert.throws(() => replacementDueWithin('2028-02-31', 5, now, london), /date is unavailable/);
  assert.throws(() => replacementDueWithin('2028-02-29', 0.5, now, london), /whole number/);
  assert.throws(() => replacementDueWithin('2028-02-29', 0, now, undefined), /timezone is unavailable/);
});
