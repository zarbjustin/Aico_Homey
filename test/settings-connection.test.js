'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

test('settings tests and saves exact credentials, and leaves a saved key alone on failure', () => {
  const html = fs.readFileSync(require.resolve('../settings/index.html'), 'utf8');
  const ids = Array.from(html.matchAll(/ id="([^"]+)"/g), ([, id]) => id);
  const nodes = new Map(ids.map((id) => [id, {
    events: {},
    evidence: {},
    querySelector() { return this.evidence; },
    addEventListener(name, call) { this.events[name] = call; },
    reset() {
      const prefix = id === 'mqtt-credentials' ? 'mqtt-' : '';
      const fields = prefix ? ['client-id', 'username', 'password', 'topic-root'] : ['client-id', 'client-secret'];
      for (const field of fields) nodes.get(prefix + field).value = '';
    },
  }]));
  const context = { document: { getElementById: (id) => nodes.get(id) } };
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  let rejectCheck = true;
  const writes = [];
  const removals = [];
  const checks = [];
  const homey = {
    ready() {},
    get(key, cb) { cb(null, false); },
    set(key, value, cb) { writes.push([key, { ...value }]); cb(); },
    unset(key, cb) { removals.push(key); cb(); },
    api(method, path, body, cb) {
      if (method === 'GET' && path === '/events') return cb(null, { state: 'waiting' });
      if (method === 'GET') return cb(null, { state: 'waiting' });
      assert.equal(path, '/connection/check');
      checks.push({ ...body });
      if (rejectCheck) return cb(new Error('HomeLINK denied access.'));
      cb(null, { summary: { records: 1, pairable: 1, linkedProperties: 0, unknown: 0, missingModel: 0, models: [] } });
    },
  };
  context.onHomeyReady(homey);
  nodes.get('client-id').value = ' entered-id ';
  nodes.get('client-secret').value = ' entered-secret ';
  const submit = () => nodes.get('credentials').events.submit({ preventDefault() {} });
  submit();
  assert.equal(writes.length, 0);
  assert.equal(nodes.get('status').textContent, 'HomeLINK denied access.');
  rejectCheck = false;
  nodes.get('test').events.click();
  assert.equal(writes.length, 0);
  submit();
  assert.deepEqual(writes, [['homelink_web_api', { clientId: 'entered-id', clientSecret: 'entered-secret' }]]);
  assert.ok(checks.every((key) => key.clientId === 'entered-id' && key.clientSecret === 'entered-secret'));
  assert.equal(nodes.get('client-secret').value, '');

  assert.match(nodes.get('mqtt-status').textContent, /MQTT key saved/);
  for (const [field, value] of [
    ['client-id', ' client '], ['username', ' user '], ['password', ' verbatim-password '], ['topic-root', 'account/+'],
  ]) nodes.get('mqtt-' + field).value = value;
  const saveMqtt = () => nodes.get('mqtt-credentials').events.submit({ preventDefault() {} });
  saveMqtt();
  assert.equal(writes.length, 1);
  nodes.get('mqtt-topic-root').value = 'account/#';
  saveMqtt();
  assert.deepEqual(writes[1], ['homelink_mqtt', {
    clientId: 'client', username: 'user', password: ' verbatim-password ', topicRoot: 'account',
  }]);
  assert.equal(nodes.get('mqtt-password').value, '');
  nodes.get('mqtt-remove').events.click();
  assert.deepEqual(removals, ['homelink_mqtt']);
});
