'use strict';

const fs = require('node:fs');
const { createRequire } = require('node:module');
const vm = require('node:vm');

class FakeHomeyObject {
  constructor(homey) { this.homey = homey; }
}

function loadAdapter(path, baseClass, constructor = FakeHomeyObject, modules = {}) {
  const filename = require.resolve(path);
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  const source = fs.readFileSync(filename, 'utf8');
  const load = vm.runInThisContext('(function (require, module) {\n' + source + '\n})', { filename });
  load((name) => name === 'homey' ? { [baseClass]: constructor } : modules[name] ?? localRequire(name), module);
  return module.exports;
}

module.exports = { FakeHomeyObject, loadAdapter };
