'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const { HomeLinkMqtt, readMqttCredentials } = require('../lib/homelink-mqtt');

const key = {
  clientId: 'synthetic-client', username: 'synthetic-user', password: 'synthetic-password', topicRoot: 'synthetic',
};
const filters = ['synthetic/alert/#', 'synthetic/device/#', 'synthetic/property/#'];
const grants = filters.map((topic) => ({ topic, qos: 0 }));

test('validates a separate MQTT key and restricts the subscription to one account root', () => {
  assert.deepEqual(readMqttCredentials({ ...key, topicRoot: ' synthetic/# ' }), key);
  assert.equal(readMqttCredentials({ ...key, password: ' unchanged ' }).password, ' unchanged ');
  for (const topicRoot of ['#', '+', 'synthetic/alert/#', 'other/+', '$SYS', '']) {
    assert.equal(readMqttCredentials({ ...key, topicRoot }), null);
  }
  assert.equal(readMqttCredentials({ ...key, password: '' }), null);
});

test('uses TLS and waits for scoped subscription acknowledgements before issuing hints', (t) => {
  const client = new EventEmitter();
  client.end = t.mock.fn();
  client.subscribe = t.mock.fn();
  const hint = t.mock.fn();
  const connect = t.mock.fn(() => client);
  const listener = new HomeLinkMqtt(key, hint, connect);
  t.after(() => listener.close());
  assert.equal(listener.state, 'connecting');
  const [[endpoint, options]] = connect.mock.calls.map((call) => call.arguments);
  assert.equal(endpoint, 'mqtts://conduit.live.homelync.io:8883');
  assert.equal(options.protocolVersion, 4);
  assert.equal(options.rejectUnauthorized, true);
  assert.equal(options.clean, true);
  assert.equal(options.resubscribe, false);
  const publish = (topic, packet = {}) => client.emit('message', topic, Buffer.from('{"eventTypeId":"CO_ALARM"}'), packet);
  client.emit('connect');
  const [topics, subscription, done] = client.subscribe.mock.calls[0].arguments;
  assert.deepEqual(topics, filters);
  assert.deepEqual(subscription, { qos: 0 });
  publish('synthetic/alert/active/old');
  assert.equal(hint.mock.callCount(), 0);
  done(null, grants);
  assert.equal(listener.state, 'listening');
  assert.equal(hint.mock.callCount(), 1);
  publish('other/alert/active/test');
  publish('synthetic/alerts/active/test');
  publish('synthetic/reading/device/test');
  publish('synthetic/alert/active/test', { retain: true });
  publish('synthetic/device/test', { dup: true });
  assert.equal(hint.mock.callCount(), 1);
  publish('synthetic/alert/active/test');
  publish('synthetic/property');
  assert.deepEqual(hint.mock.calls.map((call) => call.arguments), [[], [], []]);

  client.emit('close');
  assert.equal(listener.state, 'unavailable');
  client.emit('reconnect');
  assert.equal(listener.state, 'reconnecting');
  client.emit('connect');
  const denied = client.subscribe.mock.calls[1].arguments[2];
  denied(null, [grants[0], grants[1], { ...grants[2], qos: 128 }]);
  assert.equal(listener.state, 'unavailable');
  assert.equal(hint.mock.callCount(), 3);
  client.emit('connect');
  const stale = client.subscribe.mock.calls[2].arguments[2];
  client.emit('error', new Error('synthetic-private-error'));
  stale(null, grants);
  assert.equal(listener.state, 'unavailable');
  client.emit('connect');
  const received = client.subscribe.mock.calls[3].arguments[2];
  received(null, grants);
  assert.equal(listener.state, 'listening');
  assert.equal(hint.mock.callCount(), 4);
  listener.close();
  listener.close();
  publish('synthetic/alert/test');
  assert.equal(listener.state, 'disabled');
  assert.equal(client.end.mock.callCount(), 1);
  assert.equal(hint.mock.callCount(), 4);
});
