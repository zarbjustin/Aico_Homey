'use strict';

const { connect } = require('mqtt');

const BROKER = 'mqtts://conduit.live.homelync.io:8883';
const TOPIC_KINDS = ['alert', 'device', 'property'];
const SUBSCRIPTION_TIMEOUT_MS = 10_000;

function readMqttCredentials(value) {
  if (typeof value?.clientId !== 'string' || typeof value?.username !== 'string' ||
      typeof value?.password !== 'string' || typeof value?.topicRoot !== 'string') return null;

  const clientId = value.clientId.trim();
  const username = value.username.trim();
  const password = value.password;
  const topicRoot = value.topicRoot.trim().replace(/\/#$/, '');
  if (!clientId || !username || !password.trim() || !/^[A-Za-z0-9_.-]{1,128}$/.test(topicRoot)) return null;
  return { clientId, username, password, topicRoot };
}

class HomeLinkMqtt {
  #client;
  #state = 'connecting';
  #pendingAck;
  #closed = false;

  constructor(credentials, onHint, connectClient = connect) {
    const { clientId, username, password, topicRoot } = credentials;
    const prefixes = TOPIC_KINDS.map((kind) => topicRoot + '/' + kind);
    const topics = prefixes.map((prefix) => prefix + '/#');
    try {
      this.#client = connectClient(BROKER, {
        clientId, username, password, protocolVersion: 4, clean: true,
        rejectUnauthorized: true, connectTimeout: 10_000, reconnectPeriod: 30_000, resubscribe: false,
      });
    } catch {
      this.#state = 'unavailable';
      return;
    }
    this.#client.on('connect', () => {
      if (this.#closed) return;
      this.#setDisconnected('connecting');
      const pending = setTimeout(() => this.#setDisconnected('unavailable'), SUBSCRIPTION_TIMEOUT_MS);
      pending.unref();
      this.#pendingAck = pending;
      this.#client.subscribe(topics, { qos: 0 }, (error, grants) => {
        if (this.#pendingAck !== pending) return;
        const granted = !error && grants?.length === topics.length &&
          topics.every((topic) => grants.some((grant) => grant.topic === topic && grant.qos === 0));
        this.#setDisconnected(granted ? 'listening' : 'unavailable');
        if (granted) onHint();
      });
    });
    this.#client.on('message', (topic, _payload, packet) => {
      if (this.#state !== 'listening' || packet?.retain || packet?.dup) return;
      if (prefixes.some((prefix) => topic === prefix || topic.startsWith(prefix + '/'))) onHint();
    });
    this.#client.on('reconnect', () => this.#setDisconnected('reconnecting'));
    this.#client.on('close', () => this.#setDisconnected('unavailable'));
    this.#client.on('error', () => this.#setDisconnected('unavailable'));
  }

  get state() {
    return this.#state;
  }

  #setDisconnected(state) {
    if (this.#closed) return;
    clearTimeout(this.#pendingAck);
    this.#pendingAck = undefined;
    this.#state = state;
  }

  close() {
    if (this.#closed) return;
    this.#setDisconnected('disabled');
    this.#closed = true;
    this.#client?.end(true);
  }
}

module.exports = { HomeLinkMqtt, readMqttCredentials };
