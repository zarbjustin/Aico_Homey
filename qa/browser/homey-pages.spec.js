'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');

const origin = 'http://homey-qa.invalid';
const app = path.resolve(__dirname, '../..');
const overview = {
  paired: 3, reporting: 2, maintenanceChecked: 2, maintenanceReports: 0, oldestInventoryAt: Date.UTC(2031, 3, 12, 12),
};
const service = {
  alarms: 3, replacement: { days: 30, checked: 2, due: 0 }, lastTest: { days: 14, checked: 0, due: 0 },
};
const exampleReport = 'Aico HomeLINK support report\nApp version 0.12.0\nWeb API inventory — Available';

async function openHomeyPage(page, folder, fixture) {
  const routes = new Map([['/index.html', 'text/html']]);
  if (fixture.kind === 'widget') {
    routes.set('/' + fixture.name + '.js', 'application/javascript');
    routes.set('/' + fixture.name + '.css', 'text/css');
  }
  await page.route('**/*', (route) => {
    const target = new URL(route.request().url());
    if (target.origin !== origin) return route.abort();
    if (['/homey.js', '/favicon.ico'].includes(target.pathname)) return route.fulfill({ status: 204 });
    const contentType = routes.get(target.pathname);
    if (!contentType) return route.abort();
    return route.fulfill({ path: path.join(app, folder, target.pathname.slice(1)), contentType });
  });
  await page.addInitScript(({ kind, response }) => {
    const state = {
      response, fail: false, paths: [], reads: [],
      saved: { homelink_web_api: { clientId: 'saved-fixture', clientSecret: 'fixture-secret' } },
    };
    window.qa = state;
    const summary = {
      records: 3, pairable: 1, linkedProperties: 1, unknown: 1, missingModel: 0,
      models: [
        { model: 'Ei208WRF', count: 1, pairable: false, pairableCount: 0 },
        { model: 'Ei450', count: 1, pairable: true, pairableCount: 1 },
      ],
      modelEvidence: [
        {
          model: 'Ei208WRF', modelType: 'Other (masked)', connectivity: 'Missing', records: 1, pairable: 0,
          propertyLinks: 1, alertLinks: 0, operationalStatus: 1, collectionStatus: 0, lastSeen: 0, lastTested: 0, replacementDate: 0,
        },
        {
          model: 'Ei450', modelType: 'EIACCESSORY', connectivity: 'EIRF868', records: 1, pairable: 1,
          propertyLinks: 1, alertLinks: 1, operationalStatus: 1, collectionStatus: 1, lastSeen: 1, lastTested: 0, replacementDate: 0,
        },
      ],
    };
    const homey = {
      ready() {},
      get(key, callback) { state.reads.push(key); callback(null, state.saved[key]); },
      set(key, value, callback) { state.saved[key] = value; callback(); },
      unset(key, callback) { delete state.saved[key]; callback(); },
      getSettings: () => ({ replacementDays: 30, testDays: 14 }),
      api(method, url, body, callback) {
        state.paths.push(method + ' ' + url);
        if (kind === 'widget') return state.fail ? Promise.reject(new Error('Fixture offline')) : Promise.resolve(state.response);
        if (url === '/connection/check') {
          return body.clientId === 'verified-fixture' ? callback(null, { summary }) :
            callback(new Error('HomeLINK denied access. Check the Web API credentials and scope.'));
        }
        if (url === '/events') return callback(null, { state: state.saved.homelink_mqtt ? 'waiting' : 'disabled' });
        if (url === '/diagnostics') return state.fail ? callback(new Error('Unexpected fixture error')) : callback(null, { report: response });
        if (state.inventoryUnavailable) return callback(null, { state: 'unavailable' });
        return state.saved.homelink_web_api
          ? callback(null, { state: 'available', fetchedAt: Date.now(), summary })
          : callback(null, { state: 'unconfigured' });
      },
    };
    window.addEventListener('DOMContentLoaded', () => window.onHomeyReady(homey), { once: true });
  }, fixture);
  await page.goto(origin + '/index.html');
}

async function expectNarrowLayout(page, width, height) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  expect(dimensions.viewport).toBe(width);
  expect(dimensions.width).toBeLessThanOrEqual(width);
  if (height) expect(dimensions.height).toBeLessThanOrEqual(height);
}

test.describe('Settings', () => {
  test.use({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true });

  test('checks access at a narrow viewport and preserves previous credentials on a rejected key', async ({ page }) => {
    await openHomeyPage(page, 'settings', { kind: 'settings' });
    await expectNarrowLayout(page, 320);
    const client = page.getByLabel('Client ID', { exact: true });
    const secret = page.getByLabel('Client secret', { exact: true });
    const save = page.getByRole('button', { name: 'Verify and save credentials' });
    await expect(secret).toHaveAttribute('type', 'password');
    await expect(client).toHaveValue('');
    await expect(secret).toHaveValue('');
    await expect(page.getByRole('checkbox')).not.toBeChecked();
    await client.fill('invalid-fixture');
    await secret.fill('candidate-fixture-secret');
    await save.click();
    await expect(page.locator('#status')).toHaveText(/HomeLINK denied access/);
    expect(await page.evaluate(() => window.qa.saved.homelink_web_api.clientId)).toBe('saved-fixture');

    await client.fill('verified-fixture');
    await page.getByRole('button', { name: 'Test connection' }).click();
    await expect(page.locator('#status')).toHaveText(/Connection verified/);
    expect(await page.evaluate(() => window.qa.saved.homelink_web_api.clientId)).toBe('saved-fixture');
    await expect(page.locator('#tested-inventory')).toHaveText(/1 eligible for pairing/);
    await save.click();
    await expect(page.locator('#status')).toHaveText(/Verified key saved/);
    await expect(secret).toHaveValue('');
    expect(await page.evaluate(() => window.qa.saved.homelink_web_api.clientId)).toBe('verified-fixture');
    expect(await page.evaluate(() => window.qa.reads)).toEqual(['homelink_alarm_flow_preview']);
  });

  test('validates and removes the MQTT key independently', async ({ page }) => {
    await openHomeyPage(page, 'settings', { kind: 'settings' });
    await page.getByLabel('MQTT client ID').fill('fixture');
    await page.getByLabel('MQTT username').fill('fixture-user');
    await page.getByLabel('MQTT password').fill('fixture-broker-secret');
    const topic = page.getByLabel('Account topic root');
    await topic.fill('fixture/+');
    const save = page.getByRole('button', { name: 'Save MQTT credentials' });
    await save.click();
    await expect(page.locator('#mqtt-feedback')).toHaveText(/Enter the client ID/);
    expect(await page.evaluate(() => window.qa.saved.homelink_mqtt)).toBeUndefined();
    await topic.fill('fixture/#');
    await save.click();
    await expect(page.locator('#mqtt-status')).toHaveText(/MQTT key saved/);
    await expect(page.getByLabel('MQTT password')).toHaveValue('');
    expect(await page.evaluate(() => window.qa.saved.homelink_mqtt.topicRoot)).toBe('fixture');
    await page.getByRole('button', { name: 'Remove MQTT credentials' }).click();
    await expect(page.locator('#mqtt-status')).toHaveText(/MQTT updates are disabled/);
    expect(await page.evaluate(() => window.qa.saved.homelink_web_api.clientId)).toBe('saved-fixture');
  });

  test('shows redacted model evidence for tested and saved keys and clears stale details', async ({ page }) => {
    await openHomeyPage(page, 'settings', { kind: 'settings' });
    const tested = page.locator('#tested-model-details');
    const saved = page.locator('#saved-model-details');
    await expect(tested).toBeHidden();
    await saved.locator('summary').click();
    await expect(saved.locator('.model-evidence')).toContainText('Ei450 · Type EIACCESSORY · Connectivity EIRF868');
    await expect(saved.locator('.model-evidence')).toContainText('Ei208WRF · Type Other (masked) · Connectivity Missing');
    const client = page.getByLabel('Client ID', { exact: true });
    await client.fill('verified-fixture');
    await page.getByLabel('Client secret', { exact: true }).fill('candidate-fixture-secret');
    const check = page.getByRole('button', { name: 'Test connection' });
    await check.click();
    await tested.locator('summary').click();
    await expect(tested.locator('.model-evidence')).toContainText('Property links 1 · Alert links 1');
    await expectNarrowLayout(page, 320);

    await client.fill('invalid-fixture');
    await check.click();
    await expect(tested).toBeHidden();
    await expect(tested.locator('.model-evidence')).toHaveText('');
    await expect(saved).toBeVisible();

    await page.evaluate(() => { window.qa.inventoryUnavailable = true; });
    await page.getByRole('button', { name: 'Refresh saved status' }).click();
    await expect(saved).toBeHidden();
    await expect(saved.locator('.model-evidence')).toHaveText('');
  });

  test('generates a redacted report, handles clipboard restrictions and clears old results on error', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { async writeText(text) {
          if (window.qa.clipboardDenied) throw new Error('Clipboard blocked');
          window.qa.copied = text;
        } },
      });
    });
    await openHomeyPage(page, 'settings', { kind: 'settings', response: exampleReport });
    const generate = page.getByRole('button', { name: 'Generate report' });
    const copy = page.getByRole('button', { name: 'Copy report' });
    const report = page.getByRole('textbox', { name: 'Redacted support report' });
    const status = page.locator('#support-status');
    expect(await page.evaluate(() => window.qa.paths)).not.toContain('GET /diagnostics');
    await expect(copy).toBeDisabled();
    await generate.click();
    await expect(report).toHaveValue(exampleReport);
    await expect(report).toHaveAttribute('readonly', '');
    await expectNarrowLayout(page, 320);
    await copy.click();
    await expect(status).toHaveText('Support report copied.');
    expect(await page.evaluate(() => window.qa.copied)).toBe(exampleReport);

    await page.evaluate(() => { window.qa.clipboardDenied = true; });
    await copy.click();
    await expect(status).toHaveText(/Report selected/);
    expect(await report.evaluate((node) => node.value.slice(node.selectionStart, node.selectionEnd))).toBe(exampleReport);

    await page.evaluate(() => { window.qa.fail = true; });
    await generate.click();
    await expect(status).toHaveText('Homey could not generate the support report.');
    await expect(report).toBeHidden();
    await expect(copy).toBeDisabled();
  });
});

for (const colorScheme of ['light', 'dark']) {
  test.describe(colorScheme + ' dashboard widgets', () => {
    test.use({ colorScheme, viewport: { width: 220, height: 160 }, isMobile: true, hasTouch: true });

    test.beforeEach(async ({ page }) => {
      await page.clock.install({ time: new Date('2031-04-12T12:00:00Z') });
    });

    test('overview fits, shows partial coverage and clears its count on a failed refresh', async ({ page }) => {
      await openHomeyPage(page, 'widgets/overview/public', { kind: 'widget', name: 'overview', response: overview });
      await expect(page.locator('#reporting')).toHaveText('2/3');
      await expect(page.locator('#maintenance')).toHaveText('0');
      await expect(page.locator('#checked')).toHaveText(/2\/3 checked/);
      await expectNarrowLayout(page, 220, 160);
      const bg = colorScheme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(32, 33, 37)';
      await expect(page.locator('body')).toHaveCSS('background-color', bg);
      await page.evaluate(() => { window.qa.fail = true; });
      await page.clock.fastForward(60_000);
      await expect(page.locator('#maintenance')).toHaveText('—');
      await expect(page.locator('#status')).toHaveText(/could not load the overview/);
      await expectNarrowLayout(page, 220, 160);
    });

    test('service fits and distinguishes a known zero from missing dates', async ({ page }) => {
      await openHomeyPage(page, 'widgets/service/public', { kind: 'widget', name: 'service', response: service });
      await expect(page.locator('#replacement-count')).toHaveText('0');
      await expect(page.locator('#replacement-detail')).toHaveText(/30 days.*2\/3 checked/);
      await expect(page.locator('#test-count')).toHaveText('—');
      await expect(page.locator('#test-detail')).toHaveText(/14 days.*0\/3 checked/);
      expect(await page.evaluate(() => window.qa.paths)).toEqual(['GET /30/14']);
      await expectNarrowLayout(page, 220, 160);
      const bg = colorScheme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(32, 33, 37)';
      await expect(page.locator('body')).toHaveCSS('background-color', bg);
      await page.evaluate(() => { window.qa.fail = true; });
      await page.clock.fastForward(60_000);
      await expect(page.locator('#replacement-count')).toHaveText('—');
      await expect(page.locator('#status')).toHaveText(/could not load service dates/);
      await expectNarrowLayout(page, 220, 160);
    });
  });
}
