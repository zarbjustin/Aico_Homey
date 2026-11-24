'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const build = path.join(root, '.homeybuild');
const exists = (relative) => fs.existsSync(path.join(build, relative));
const read = (relative) => JSON.parse(fs.readFileSync(path.join(build, relative), 'utf8'));

assert.ok(exists('app.json'), 'Build the app with the Homey CLI before checking the package.');
const manifest = read('app.json');
const packageJson = read('package.json');
const lock = read('package-lock.json');
assert.deepEqual(manifest, require('../app.json'), 'The package manifest must match the generated app manifest.');
assert.equal(manifest.version, packageJson.version);
assert.equal(lock.version, packageJson.version);
assert.equal(manifest.id, packageJson.name);
assert.deepEqual(manifest.platforms, ['local']);
assert.ok(Object.values(manifest.api).every(({ public: isPublic }) => isPublic === false));

const dependencies = Object.entries(lock.packages).filter(([relative, entry]) => relative && !entry.dev && !entry.optional);
for (const [relative, entry] of dependencies) {
  assert.ok(exists(relative + '/package.json'), 'Missing production dependency ' + relative);
  assert.equal(read(relative + '/package.json').version, entry.version, 'Locked dependency mismatch for ' + relative);
}
for (const [relative, entry] of Object.entries(lock.packages)) {
  if (entry.dev) assert.equal(exists(relative), false, 'Development dependency must stay out of the package: ' + relative);
}
for (const file of ['qa', 'test', 'docs', '.git', '.env', 'env.json', 'private', 'diagnostics']) {
  assert.equal(exists(file), false, 'Development or private files must stay out of the package: ' + file);
}

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
for (const widget of ['overview', 'service']) {
  assert.ok(manifest.widgets[widget], 'Missing widget manifest for ' + widget);
  assert.ok(exists('widgets/' + widget + '/public/index.html'));
  for (const theme of ['light', 'dark']) {
    const preview = 'widgets/' + widget + '/__assets__/preview-' + theme + '.png';
    assert.deepEqual(fs.readFileSync(path.join(build, preview)).subarray(0, png.length), png);
  }
}

console.log('Homey package ' + manifest.version + ' verified with ' + dependencies.length + ' locked production dependencies and both widgets.');
