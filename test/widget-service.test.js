'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const { getService } = require('../widgets/service/api');

test('counts alarm service dates using Homey’s local date and reports missing coverage', async (t) => {
  const now = Date.parse('2026-03-29T23:30:00Z');
  t.mock.method(Date, 'now', () => now);
  function paired(model, dates) {
    return {
      getData: () => ({ model }),
      getDashboardStatus: () => ({ inventoryFetchedAt: dates ? now : null }),
      getServiceDates: () => {
        assert.ok(dates, 'stale devices should never supply a service date');
        return dates;
      },
    };
  }
  const devices = [
    paired('Ei3018', { replaceBy: '2026-03-30', lastTested: '2026-03-29T23:15:00Z' }),
    paired('Ei3030', { replaceBy: 'Unknown', lastTested: '2026-03-23' }),
    paired('Ei3016', { replaceBy: '2026-12-31', lastTested: '2026-03-30T04:00:00Z' }),
    paired('Ei3028', null),
    paired('Ei1000G', null),
    paired('Ei450', null),
  ];
  const homey = {
    clock: { getTimezone: () => 'Europe/London' },
    drivers: { getDriver: () => ({ getDevices: () => devices }) },
  };
  assert.deepEqual(await getService({ homey, params: { replacementDays: '0', testDays: '7' } }), {
    alarms: 4,
    replacement: { days: 0, checked: 2, due: 1 },
    lastTest: { days: 7, checked: 2, due: 1 },
  });
  const safe = await getService({ homey, params: { replacementDays: '4.5', testDays: '0' } });
  assert.equal(safe.replacement.days, 90);
  assert.equal(safe.lastTest.days, 7);
});

test('renders partial coverage, known zero and a failed refresh without retaining old counts', async () => {
  const html = fs.readFileSync(require.resolve('../widgets/service/public/index.html'), 'utf8');
  const js = fs.readFileSync(require.resolve('../widgets/service/public/service.js'), 'utf8');
  const nodes = new Map(Array.from(html.matchAll(/ id="([^"]+)"/g), ([, id]) => [id, { dataset: {} }]));
  let refresh;
  let fail = false;
  const context = {
    document: { getElementById: (id) => nodes.get(id) },
    window: { addEventListener() {} },
    setInterval(callback) { refresh = callback; },
  };
  vm.runInNewContext(js, context);
  context.onHomeyReady({
    ready() {},
    getSettings: () => ({ replacementDays: 30, testDays: 14 }),
    api: async (method, path) => {
      assert.equal(method, 'GET');
      assert.equal(path, '/30/14');
      if (fail) throw new Error('unavailable');
      return {
        alarms: 3,
        replacement: { days: 30, checked: 2, due: 0 },
        lastTest: { days: 14, checked: 0, due: 0 },
      };
    },
  });
  await new Promise(setImmediate);
  assert.equal(nodes.get('replacement-count').textContent, 0);
  assert.match(nodes.get('replacement-detail').textContent, /2\/3 checked/);
  assert.equal(nodes.get('test-count').textContent, '—');
  fail = true;
  await refresh();
  assert.equal(nodes.get('replacement-count').textContent, '—');
  assert.equal(nodes.get('status').textContent, 'Homey could not load service dates');
});
