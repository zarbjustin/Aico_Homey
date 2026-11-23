'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const { getOverview } = require('../widgets/overview/api');

function homeyWith(rows) {
  return { drivers: { getDriver: (id) => {
    assert.equal(id, 'homelink-device');
    return { getDevices: () => rows.map((status) => ({ getDashboardStatus: () => status })) };
  } } };
}

test('the widget endpoint returns cached aggregates and makes partial coverage explicit', async () => {
  const result = await getOverview({ homey: homeyWith([
    { inventoryFetchedAt: 120_000, maintenanceCount: 2 },
    { inventoryFetchedAt: 115_000, maintenanceCount: 0 },
    { inventoryFetchedAt: 125_000, maintenanceCount: null },
    { inventoryFetchedAt: null, maintenanceCount: null },
  ]) });
  assert.deepEqual(result, { paired: 4, reporting: 3, maintenanceChecked: 2, maintenanceReports: 2, oldestInventoryAt: 115_000 });
  const missing = await getOverview({ homey: homeyWith([]) });
  assert.deepEqual(missing, { paired: 0, reporting: 0, maintenanceChecked: 0, maintenanceReports: null, oldestInventoryAt: null });
});

test('the widget webview renders known zero and replaces the data on a read error', async () => {
  const elements = Object.fromEntries(['reporting', 'coverage', 'maintenance', 'checked', 'status'].map((id) => [
    id, { textContent: '', dataset: {} },
  ]));
  let refresh;
  let error = false;
  const source = readFileSync(require.resolve('../widgets/overview/public/overview.js'), 'utf8');
  const ctx = {
    document: { getElementById: (id) => elements[id] },
    window: { addEventListener: () => {} },
    setInterval: (fn) => { refresh = fn; },
    clearInterval: () => {},
  };
  vm.runInNewContext(source, ctx);
  ctx.onHomeyReady({
    ready: () => {},
    api: async (method, path) => {
      assert.equal(method, 'GET');
      assert.equal(path, '/');
      if (error) throw new Error('Synthetic read error');
      return { paired: 6, reporting: 5, maintenanceChecked: 4, maintenanceReports: 0, oldestInventoryAt: Date.now() };
    },
  });
  await new Promise(setImmediate);
  assert.equal(elements.reporting.textContent, '5/6');
  assert.equal(elements.maintenance.textContent, 0);
  assert.match(elements.checked.textContent, /4\/6 checked/);
  error = true;
  await refresh();
  assert.equal(elements.maintenance.textContent, '—');
  assert.equal(elements.status.textContent, 'Homey could not load the overview');
});
