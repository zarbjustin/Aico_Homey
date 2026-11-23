'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { MaintenanceState } = require('../lib/maintenance-state');

const house = 'SYNTHETIC-HOME';
const minute = 60_000;

test('seeds existing alerts and publishes new IDs even if the count stays the same', () => {
  const state = new MaintenanceState();
  assert.equal(state.count(0), undefined);
  assert.equal(state.observe(house, 0, ['existing'], 0), undefined);
  assert.equal(state.count(0), 1);
  assert.equal(state.observe(house, 0, ['existing'], minute), undefined);
  assert.deepEqual(state.observe(house, 5 * minute, ['new'], 5 * minute), {
    kind: 'reported', activeCount: 1, newCount: 1, observedAt: '1970-01-01T00:05:00.000Z',
  });
  assert.equal(state.observe(house, 6 * minute, ['new'], 6 * minute), undefined);
});

test('publishes clearing only on the transition to zero reports', () => {
  const state = new MaintenanceState();
  state.observe(house, 0, ['first', 'second'], 0);
  assert.equal(state.observe(house, 5 * minute, ['second'], 5 * minute), undefined);
  assert.deepEqual(state.observe(house, 10 * minute, [], 10 * minute), {
    kind: 'cleared', previousCount: 1, observedAt: '1970-01-01T00:10:00.000Z',
  });
  assert.equal(state.count(10 * minute), 0);
  assert.equal(state.observe(house, 15 * minute, [], 15 * minute), undefined);
});

test('seeds the first recovery, stale interval, or property change in isolation', () => {
  const state = new MaintenanceState();
  state.observe(house, 0, ['old'], 0);
  state.reset();
  assert.equal(state.count(minute), undefined);
  assert.equal(state.observe(house, 5 * minute, ['while-offline'], 5 * minute), undefined);
  assert.equal(state.count(12 * minute + 1), undefined);
  assert.equal(state.observe(house, 15 * minute, [], 15 * minute), undefined);

  state.resetIfPropertyChanged('ANOTHER-HOME');
  assert.equal(state.count(15 * minute), undefined);
  assert.equal(state.observe('ANOTHER-HOME', 16 * minute, ['other'], 16 * minute), undefined);
  assert.equal(state.count(16 * minute), 1);
});

test('ignores out-of-order and rejects future observations', () => {
  const state = new MaintenanceState();
  state.observe(house, 5 * minute, ['active'], 5 * minute);
  assert.equal(state.observe(house, 4 * minute, [], 5 * minute), undefined);
  assert.equal(state.count(5 * minute), 1);
  assert.equal(state.count(4 * minute), undefined);
  assert.equal(state.observe(house, 6 * minute, [], 5 * minute), undefined);
  assert.equal(state.count(5 * minute), undefined);
});
