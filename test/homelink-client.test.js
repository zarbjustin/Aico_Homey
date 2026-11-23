'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { HomeLinkClient, readCredentials } = require('../lib/homelink-client');

const credentials = { clientId: 'test & id', clientSecret: 'test + = secret' };
const token = { accessToken: 'synthetic-token' };
const inventory = { page: 1, totalPages: 1, results: [{ model: 'Ei3030', serialNumber: 'SYNTHETIC-01' }] };

function clientFor(responses, now) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url: new URL(url), options });
    const next = responses.shift();
    if (!next) throw new Error('Unexpected request');
    return Response.json(next.body, { status: next.status ?? 200, headers: next.headers });
  };
  return { calls, client: new HomeLinkClient(credentials, { fetch, now }) };
}

test('requires both credentials and trims paste whitespace', () => {
  assert.equal(readCredentials({ clientId: 'id', clientSecret: '  ' }), null);
  assert.equal(readCredentials({ clientId: 7, clientSecret: 'secret' }), null);
  assert.deepEqual(readCredentials({ clientId: ' id ', clientSecret: ' secret ' }), {
    clientId: 'id', clientSecret: 'secret',
  });
});

test('authenticates, coalesces concurrent reads and keeps a short cache', async () => {
  let now = 100_000;
  const { client, calls } = clientFor([{ body: token }, { body: inventory }, { body: inventory }], () => now);
  const [first, second] = await Promise.all([client.getInventory(), client.getInventory()]);
  assert.equal(first, second);
  assert.deepEqual(first, { rows: inventory.results, fetchedAt: now });
  assert.equal(calls[0].url.origin, 'https://auth.live.homelync.io');
  assert.equal(calls[0].url.pathname, '/oauth2');
  assert.equal(calls[0].url.searchParams.get('client'), credentials.clientId);
  assert.equal(calls[0].url.searchParams.get('secret'), credentials.clientSecret);
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[1].url.href, 'https://frontier.live.homelync.io/v1/device');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer synthetic-token');

  now += 19_999;
  assert.equal(await client.getInventory(), first);
  assert.equal(calls.length, 2);
  now += 1;
  assert.equal((await client.getInventory()).fetchedAt, now);
  assert.equal(calls.length, 3);
});

test('renews the bearer token and retries inventory once after 401', async () => {
  const { client, calls } = clientFor([
    { body: token }, { body: {}, status: 401 },
    { body: { accessToken: 'synthetic-renewed' } }, { body: inventory },
  ]);
  assert.deepEqual((await client.getInventory()).rows, inventory.results);
  assert.equal(calls.length, 4);
  assert.equal(calls[3].options.headers.Authorization, 'Bearer synthetic-renewed');
});

test('stops after a second 401 and keeps upstream text out of errors', async () => {
  const { client, calls } = clientFor([
    { body: token }, { body: {}, status: 401 },
    { body: token }, { body: { detail: 'sensitive example' }, status: 401 },
  ]);
  await assert.rejects(client.getInventory(), { message: 'HomeLINK denied access. Check the Web API credentials and scope.' });
  assert.equal(calls.length, 4);
});

test('does not use a prior good snapshot after a failed refresh', async () => {
  let now = 100_000;
  const { client } = clientFor([
    { body: token }, { body: inventory }, { body: {}, status: 503 }, { body: inventory },
  ], () => now);
  await client.getInventory();
  now += 60_000;
  await assert.rejects(client.getInventory(), /unsuccessful response/);
  assert.equal((await client.getInventory()).fetchedAt, now);
});

test('honours a HomeLINK retry delay without issuing extra calls', async () => {
  let now = 0;
  const { client, calls } = clientFor([
    { body: token }, { body: {}, status: 429, headers: { 'retry-after': '120' } }, { body: inventory },
  ], () => now);
  await assert.rejects(client.getInventory(), /rate limited/);
  now = 119_999;
  await assert.rejects(client.getInventory(), /rate limited/);
  assert.equal(calls.length, 2);
  now = 120_000;
  assert.equal((await client.getInventory()).fetchedAt, now);
});

test('rejects incomplete or malformed inventory envelopes', async () => {
  for (const [body, reason] of [
    [{ ...inventory, totalPages: 2 }, /multiple pages/],
    [{ ...inventory, page: 2 }, /unexpected inventory page/],
    [{ results: null }, /invalid device list/],
  ]) {
    const { client } = clientFor([{ body: token }, { body }]);
    await assert.rejects(client.getInventory(), reason);
  }
});

test('cancels in-flight work when the credentials change', async () => {
  let signal;
  const client = new HomeLinkClient(credentials, {
    fetch: async (url, options) => {
      signal = options.signal;
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error(String(url))), { once: true });
      });
    },
  });
  const pending = client.getInventory();
  client.close();
  assert.equal(signal.aborted, true);
  await assert.rejects(pending, { message: 'HomeLINK could not be reached.' });
  await assert.rejects(client.getInventory(), /credentials changed/);
});
