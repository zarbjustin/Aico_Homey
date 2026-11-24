'use strict';

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './browser',
  outputDir: './test-results',
  reporter: 'list',
  workers: 2,
  use: { browserName: 'chromium', serviceWorkers: 'block' },
});
