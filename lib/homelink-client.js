'use strict';

const { isPropertyReference } = require('./identity');
const { activeMaintenanceByDevice } = require('./maintenance');
const { activeAlarmsByDevice } = require('./alarm-alerts');
const { ALERT_REFRESH_MS } = require('./alert-state');
const { READING_REFRESH_MS, READING_MAX_AGE_MS, collectReadings } = require('./environmental-readings');

const TOKEN_URL = 'https://auth.live.homelync.io/oauth2';
const API_BASE = 'https://frontier.live.homelync.io/v1/';
const TOKEN_LIFETIME_MS = 19 * 60 * 60 * 1000;
const CACHE_MS = 20_000;

class IncompleteInventoryError extends Error {}

function readCredentials(value) {
  if (typeof value?.clientId !== 'string' || typeof value?.clientSecret !== 'string') {
    return null;
  }
  const clientId = value.clientId.trim();
  const clientSecret = value.clientSecret.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

class HomeLinkClient {
  #credentials;
  #fetch;
  #now;
  #lifetime = new AbortController();
  #token;
  #tokenPending;
  #propertyAlerts = new Map();
  #propertyReadings = new Map();
  #cache;
  #pending;
  #retryAt = 0;

  constructor(credentials, { fetch = globalThis.fetch, now = Date.now } = {}) {
    this.#credentials = credentials;
    this.#fetch = fetch;
    this.#now = now;
  }

  get retryAt() {
    return this.#retryAt;
  }

  close() {
    this.#lifetime.abort();
    this.#propertyAlerts.clear();
    this.#propertyReadings.clear();
  }

  async #get(url, headers) {
    try {
      return await this.#fetch(url, {
        headers: { Accept: 'application/json', ...headers },
        redirect: 'error',
        signal: AbortSignal.any([this.#lifetime.signal, AbortSignal.timeout(10_000)]),
      });
    } catch {
      // Fetch errors can contain a URL with credentials.
      throw new Error('HomeLINK could not be reached.');
    }
  }

  async #json(response) {
    if (!response.ok) await response.body?.cancel().catch(() => {});
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      const seconds = Number(retryAfter);
      const delay = retryAfter && Number.isFinite(seconds)
        ? seconds * 1000 : Date.parse(retryAfter) - this.#now();
      const next = this.#now() + (Number.isFinite(delay) ? Math.max(60_000, delay) : 60_000);
      this.#retryAt = Math.max(this.#retryAt, next);
      throw new Error('HomeLINK rate limited the request. Try again later.');
    }
    if ([400, 401, 403].includes(response.status)) {
      throw new Error('HomeLINK denied access. Check the Web API credentials and scope.');
    }
    if (!response.ok) throw new Error('HomeLINK returned an unsuccessful response.');
    try {
      return await response.json();
    } catch {
      throw new Error('HomeLINK returned an unreadable response.');
    }
  }

  #assertOpen() {
    if (this.#lifetime.signal.aborted) throw new Error('HomeLINK credentials changed.');
  }

  #assertCanRequest() {
    this.#assertOpen();
    if (this.#retryAt > this.#now()) throw new Error('HomeLINK rate limited the request. Try again later.');
  }

  async #getToken() {
    if (this.#token?.expiresAt > this.#now()) return this.#token;
    this.#tokenPending ??= this.#fetchToken().finally(() => {
      this.#tokenPending = undefined;
    });
    return this.#tokenPending;
  }

  async #fetchToken() {
    const url = new URL(TOKEN_URL);
    url.searchParams.set('client', this.#credentials.clientId);
    url.searchParams.set('secret', this.#credentials.clientSecret);
    const data = await this.#json(await this.#get(url));
    if (typeof data?.accessToken !== 'string' || !/^[\x21-\x7e]+$/.test(data.accessToken)) {
      throw new Error('HomeLINK did not return a usable access token.');
    }
    this.#token = { value: data.accessToken, expiresAt: this.#now() + TOKEN_LIFETIME_MS };
    return this.#token;
  }

  async #getAuthorizedJson(url) {
    const request = async () => {
      this.#assertCanRequest();
      const token = await this.#getToken();
      this.#assertCanRequest();
      const response = await this.#get(url, { Authorization: 'Bearer ' + token.value });
      return { token, response };
    };
    let { token, response } = await request();
    if (response.status === 401) {
      await response.body?.cancel().catch(() => {});
      if (this.#token === token) this.#token = undefined;
      ({ response } = await request());
    }

    return this.#json(response);
  }

  async #loadInventory() {
    const data = await this.#getAuthorizedJson(API_BASE + 'device');
    if (!Array.isArray(data?.results)) throw new Error('HomeLINK returned an invalid device list.');
    if (Number.isSafeInteger(data.totalPages) && data.totalPages > 1) {
      throw new IncompleteInventoryError('This HomeLINK inventory spans multiple pages. Pairing requires a single page.');
    }
    if (data.page !== undefined && data.page !== 1) {
      throw new IncompleteInventoryError('HomeLINK returned an unexpected inventory page.');
    }
    const count = data.results.length;
    if ((data.totalPages !== undefined && ![0, 1].includes(data.totalPages)) ||
        (data.count !== undefined && data.count !== count) ||
        (data.limit !== undefined && (!Number.isSafeInteger(data.limit) || data.limit < count)) ||
        (data.totalPages === 0 && count > 0)) {
      throw new IncompleteInventoryError('HomeLINK returned an incomplete inventory. Pairing requires a complete device list.');
    }
    return data.results;
  }

  async getInventory({ refresh = false } = {}) {
    this.#assertOpen();
    if (this.#pending) return this.#pending;
    if (!refresh && this.#cache && this.#now() - this.#cache.fetchedAt < CACHE_MS) return this.#cache;
    this.#pending ??= this.#loadInventory().then((rows) => {
      this.#assertOpen();
      this.#cache = { rows, fetchedAt: this.#now() };
      return this.#cache;
    }).catch((error) => {
      this.#cache = undefined;
      throw error;
    }).finally(() => {
      this.#pending = undefined;
    });
    return this.#pending;
  }

  #propertySnapshot(cache, reference, maxAge, refresh, read) {
    this.#assertOpen();
    if (!isPropertyReference(reference)) throw new Error('HomeLINK returned an invalid property reference.');

    const now = this.#now();
    for (const [key, entry] of cache) {
      if (entry.fetchedAt !== undefined &&
        (now < entry.fetchedAt || now - entry.fetchedAt >= maxAge)) {
        cache.delete(key);
      }
    }
    const existing = cache.get(reference);
    if (existing && (!refresh || existing.fetchedAt === undefined)) return existing;

    const pending = read().then((snapshot) => {
      this.#assertOpen();
      cache.set(reference, snapshot);
      return snapshot;
    }).catch((error) => {
      cache.delete(reference);
      throw error;
    });
    cache.set(reference, pending);
    return pending;
  }

  async getPropertyMaintenance(reference, { refresh = false } = {}) {
    return this.#propertySnapshot(this.#propertyAlerts, reference, ALERT_REFRESH_MS, refresh,
      () => this.#loadPropertyMaintenance(reference));
  }

  async getPropertyReadings(reference) {
    return this.#propertySnapshot(this.#propertyReadings, reference, READING_REFRESH_MS, false,
      () => this.#loadPropertyReadings(reference));
  }

  async #loadPropertyReadings(reference) {
    const now = this.#now();
    const date = (time) => new Date(time).toISOString().slice(0, 10);
    const dates = new Set([date(now), date(now - READING_MAX_AGE_MS)]);
    const byDevice = new Map();
    for (const day of dates) {
      const data = await this.#getAuthorizedJson(API_BASE + 'property/' + encodeURIComponent(reference) + '/readings?date=' + day);
      collectReadings(data, reference, day, this.#now(), byDevice);
    }
    return { byDevice, fetchedAt: this.#now() };
  }

  async #loadPropertyMaintenance(reference) {
    const data = await this.#getAuthorizedJson(API_BASE + 'property/' + encodeURIComponent(reference) + '/alerts');
    if (!Array.isArray(data?.results) ||
      (data.count !== undefined && data.count !== data.results.length) ||
      (data.totalPages !== undefined && ![0, 1].includes(data.totalPages)) ||
      (data.page !== undefined && data.page !== 1)) {
      throw new Error('HomeLINK returned an incomplete property alert list.');
    }
    const activeByDevice = activeMaintenanceByDevice(data.results, reference);
    let alarmsByDevice;
    try {
      alarmsByDevice = activeAlarmsByDevice(data.results, reference);
    } catch {
      // A malformed alarm report must not be interpreted as an empty alarm snapshot.
      alarmsByDevice = null;
    }
    return { activeByDevice, alarmsByDevice, fetchedAt: this.#now() };
  }
}

module.exports = { HomeLinkClient, IncompleteInventoryError, readCredentials };
