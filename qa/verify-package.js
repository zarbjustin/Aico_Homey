'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const build = path.join(root, '.homeybuild');
const exists = (relative) => fs.existsSync(path.join(build, relative));
const read = (relative) => JSON.parse(fs.readFileSync(path.join(build, relative), 'utf8'));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function packageContents(directory, prefix = '', entries = []) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const local = path.join(directory, item.name);
    const relative = prefix + item.name;
    if (item.isDirectory()) {
      packageContents(local, relative + '/', entries);
    } else if (item.isSymbolicLink()) {
      entries.push([relative, 'link', sha256(fs.readlinkSync(local))]);
    } else {
      assert.ok(item.isFile(), 'Unexpected entry in Homey build: ' + relative);
      entries.push([relative, 'file', sha256(fs.readFileSync(local))]);
    }
  }
  return entries;
}

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

const entries = packageContents(build);
entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
const fingerprint = sha256(JSON.stringify(entries));
console.log('Build staging content SHA-256 ' + fingerprint);

if (process.env.GITHUB_STEP_SUMMARY) {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    '## Homey package check',
    '',
    '| Field | Value |',
    '| --- | --- |',
    '| Checked out commit | `' + commit + '` |',
    '| Homey app | `' + manifest.id + '` |',
    '| Version | ' + manifest.version + ' |',
    '| Locked production dependencies checked | ' + dependencies.length + ' |',
    '| Staged files and links | ' + entries.length + ' |',
    '| Build staging content SHA-256 | `' + fingerprint + '` |',
    '',
  ].join('\n') + '\n');
}
