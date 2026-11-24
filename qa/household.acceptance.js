'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const api = require('../api');
const { getOverview } = require('../widgets/overview/api');
const { getService } = require('../widgets/service/api');
const { NORTH, SOUTH, alert, createHousehold } = require('./synthetic-household');

const MINUTE = 60_000;
const ACTIVE = 'homelink_maintenance_alerts';
const TEMPERATURE = 'measure_temperature';
const FIRE_FLOW = 'homelink_fire_reported';
const CO_FLOW = 'homelink_co_reported';
const MAINTENANCE_FLOW = 'homelink_maintenance_reported';

test('simulated household acceptance', { timeout: 10_000 }, async (t) => {
  const household = createHousehold(t);
  const { homey, cloud, triggers, conditions, device, id } = household;
  const value = (name, key) => device(name).getCapabilityValue(key);
  const triggerRoutes = () => triggers.map(({ id, device }) => [id, device]).sort();
  let pairs;

  await t.test('pairs six devices with stable identities and populates both widgets', async () => {
    pairs = await household.start();
    assert.equal(homey.app.alarmPreviewSince, null);
    assert.deepEqual(pairs.map(({ data }) => data.model).sort(), [
      'Ei1000G', 'Ei1020', 'Ei1025', 'Ei3016', 'Ei3018', 'Ei3030',
    ]);
    assert.equal(new Set(pairs.map(({ data }) => data.id)).size, pairs.length);
    assert.ok(pairs.every(({ data }) => /^[0-9a-f]{64}$/.test(data.id)));
    assert.equal(value('air', TEMPERATURE), 21);
    assert.equal(value('climate', TEMPERATURE), 17);
    assert.equal(device('climate').hasCapability('measure_co2'), false);
    assert.equal(triggers.length, 0);

    const previous = cloud.calls.length;
    const overview = await getOverview({ homey });
    assert.equal(overview.reporting, 6);
    assert.equal(overview.maintenanceReports, 0);
    const service = await getService({ homey, params: { replacementDays: '0', testDays: '7' } });
    assert.deepEqual(service, {
      alarms: 3,
      replacement: { days: 0, checked: 3, due: 1 },
      lastTest: { days: 7, checked: 3, due: 3 },
    });
    const { report } = await api.getSupportReport({ homey });
    assert.match(report, /Web API inventory — Available\n  6\/6 paired devices with usable data/);
    assert.match(report, /Maintenance alerts — 6\/6 paired devices with usable data/);
    assert.match(report, /Environmental readings — 2\/2 paired devices with usable data/);
    assert.match(report, /MQTT listener — Connecting\nAlarm Flow preview — Disabled/);
    assert.deepEqual(report.match(/Last successful read .+/g), Array(3).fill('Last successful read 2031-04-12T12:00:00.000Z'));
    assert.equal(cloud.calls.length, previous, 'widgets and the support report only read cached data');
  });

  await t.test('reports each new fire, CO and maintenance event once to the matching alarm', async () => {
    household.setPreview(true);
    await household.settle();
    household.connect();
    await household.applyHint();
    assert.equal(triggers.length, 0, 'startup reports seed the preview baseline');
    const fire = alert('fire', 'new-fire', 'FIRE_ALARM');
    const co = alert('co', 'new-co', 'CO_ALARM');
    const maintenance = alert('fire', 'new-maintenance', 'HEAD_REMOVED', 'PRIORITY_MAINTENANCE');
    cloud.alerts.get(NORTH).push(fire, fire, co, co, maintenance, maintenance);
    household.publish({ retain: true });
    household.publish({ dup: true });
    assert.equal(household.pendingHints(), 0);
    household.publish();
    household.publish();
    await household.applyHint();
    const expected = [
      [FIRE_FLOW, id('fire')],
      [CO_FLOW, id('co')],
      [MAINTENANCE_FLOW, id('fire')],
    ].sort();
    assert.deepEqual(triggerRoutes(), expected);
    assert.ok(triggers.every(({ tokens }) => tokens.new_count === 1));
    household.publish();
    await household.applyHint();
    assert.deepEqual(triggerRoutes(), expected, 'a later read of the same report IDs stays quiet');
  });

  await t.test('isolates a mismatched alert or reading from the other property', async () => {
    const southFault = alert('combined', 'south-fault', 'HEAD_REMOVED', 'PRIORITY_MAINTENANCE');
    cloud.alerts.get(NORTH).push(southFault);
    cloud.alerts.get(SOUTH).push(southFault);
    cloud.badReadingLink = true;
    await household.pollAfter(5 * MINUTE);
    assert.equal(value('fire', ACTIVE), 'Unknown');
    assert.equal(value('combined', ACTIVE), '1 active');
    assert.deepEqual(triggers.slice(3).map(({ id, device }) => [id, device]), [[MAINTENANCE_FLOW, id('combined')]]);
    assert.equal(value('air', TEMPERATURE), 21);
    assert.equal(value('climate', TEMPERATURE), 17, 'foreign reading cannot replace a valid sample');
    assert.equal(await conditions.get('homelink_maintenance_data_available')({ device: device('fire') }), false);
    assert.match((await api.getSupportReport({ homey })).report, /Maintenance alerts — 2\/6 paired devices with usable data/);
    cloud.alerts.set(NORTH, cloud.alerts.get(NORTH).filter((report) => report !== southFault));
  });

  await t.test('marks an outage unavailable and seeds recovery without replaying active reports', async () => {
    const { report: beforeOutage } = await api.getSupportReport({ homey });
    household.disconnect();
    cloud.down = true;
    await household.pollAfter(MINUTE);
    assert.equal((await api.getEventStatus({ homey })).state, 'unavailable');
    assert.equal((await api.getConnectionStatus({ homey })).state, 'unavailable');
    assert.equal(device('air').getAvailable(), false);
    assert.equal((await getOverview({ homey })).reporting, 0);
    assert.equal((await getService({ homey })).replacement.checked, 0);
    assert.equal(triggers.length, 4);
    const { report: duringOutage } = await api.getSupportReport({ homey });
    assert.match(duringOutage, /Web API inventory — Last read failed\n  0\/6 paired devices with usable data/);
    assert.match(duringOutage, /Environmental readings — 0\/2 paired devices with usable data/);
    assert.deepEqual(duringOutage.match(/Last successful read .+/g), beforeOutage.match(/Last successful read .+/g));

    cloud.down = false;
    cloud.alerts.get(NORTH).push(alert('fire', 'during-outage', 'FIRE_ALARM'));
    household.connect();
    await household.applyHint();
    assert.equal((await api.getEventStatus({ homey })).state, 'listening');
    assert.equal((await getOverview({ homey })).reporting, 6);
    assert.equal(triggers.length, 4);
  });

  await t.test('expires old readings while retaining recent inventory', async () => {
    await household.pollAfter(61 * MINUTE);
    assert.equal(device('air').getAvailable(), true);
    assert.equal(value('air', TEMPERATURE), null);
    assert.equal(value('climate', TEMPERATURE), null);
    assert.equal(value('air', 'homelink_readings_sampled_at'), 'Unknown');
    const { report } = await api.getSupportReport({ homey });
    assert.ok(report.includes('Environmental readings — 0/2 paired devices with usable data\n  Last successful read ' +
      new Date(Date.now()).toISOString()));
    assert.equal(triggers.length, 4);
  });

  await t.test('keeps paired identities across restart and sends only subsequent new reports', async () => {
    household.stop();
    await household.start(pairs);
    assert.equal((await getOverview({ homey })).paired, 6);
    assert.equal(triggers.length, 4);
    household.connect();
    await household.applyHint();
    assert.equal(triggers.length, 4);

    cloud.alerts.get(NORTH).push(alert('co', 'after-restart', 'CO_ALARM'));
    household.publish();
    await household.applyHint();
    assert.deepEqual(triggers.slice(4).map(({ id, device }) => [id, device]), [[CO_FLOW, id('co')]]);
    assert.equal(triggers[4].tokens.new_count, 1);
  });

  await t.test('exposes aggregate diagnostics and suppresses vendor error text', async () => {
    const status = await api.getConnectionStatus({ homey });
    assert.equal(status.state, 'available');
    assert.equal(status.summary.linkedProperties, 2);
    assert.equal(status.summary.pairable, 6);
    assert.doesNotMatch(JSON.stringify(status), /synthetic|secret|serialNumber|location|password|topicRoot/i);
    await assert.rejects(api.checkConnection({ homey, body: { clientId: 'bad', clientSecret: 'synthetic' } }),
      { message: 'HomeLINK denied access. Check the Web API credentials and scope.' });
    assert.equal((await api.getConnectionStatus({ homey })).state, 'available');
    const { report } = await api.getSupportReport({ homey });
    assert.doesNotMatch(report, /synthetic|secret|serialNumber|location|password|topicRoot|[0-9a-f]{64}|Ei\d{4}/i);
    assert.match(report, /MQTT listener — Listening\nAlarm Flow preview — Enabled/);
  });
});
