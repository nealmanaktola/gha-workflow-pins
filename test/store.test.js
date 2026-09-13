'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createStore } = require('../src/store.js');
const { FakeApi, FakeStorageArea } = require('./fakes.js');

test('a repo starts with no pins', async () => {
  const store = createStore(new FakeApi());
  assert.deepEqual(await store.getPins('acme/widgets'), []);
});

test('toggle adds then removes a pin', async () => {
  const store = createStore(new FakeApi());
  assert.deepEqual(await store.togglePin('acme/widgets', 'ci.yaml'), ['ci.yaml']);
  assert.deepEqual(await store.getPins('acme/widgets'), ['ci.yaml']);
  assert.deepEqual(await store.togglePin('acme/widgets', 'ci.yaml'), []);
  assert.deepEqual(await store.getPins('acme/widgets'), []);
});

test('pins keep the order the user pinned them in', async () => {
  const store = createStore(new FakeApi());
  await store.togglePin('acme/widgets', 'deploy.yaml');
  await store.togglePin('acme/widgets', 'ci.yaml');
  await store.togglePin('acme/widgets', 'e2e.yaml');
  assert.deepEqual(await store.getPins('acme/widgets'), ['deploy.yaml', 'ci.yaml', 'e2e.yaml']);
});

test('pins in one repo do not leak into another', async () => {
  const store = createStore(new FakeApi());
  await store.togglePin('acme/widgets', 'ci.yaml');
  assert.deepEqual(await store.getPins('acme/gadgets'), []);
});

test('setPins drops duplicates', async () => {
  const store = createStore(new FakeApi());
  await store.setPins('acme/widgets', ['ci.yaml', 'ci.yaml', 'e2e.yaml']);
  assert.deepEqual(await store.getPins('acme/widgets'), ['ci.yaml', 'e2e.yaml']);
});

test('there is no pin limit', async () => {
  const store = createStore(new FakeApi());
  const ids = Array.from({ length: 40 }, (_, i) => `wf-${i}.yaml`);
  await store.setPins('acme/widgets', ids);
  assert.equal((await store.getPins('acme/widgets')).length, 40);
});

test('writes fall back to local when sync is unavailable', async () => {
  const sync = new FakeStorageArea({ failWrites: true, failReads: true });
  const local = new FakeStorageArea();
  const store = createStore(new FakeApi({ sync, local }));

  await store.togglePin('acme/widgets', 'ci.yaml');

  assert.deepEqual(await store.getPins('acme/widgets'), ['ci.yaml']);
  assert.equal(await store.activeAreaName(), 'local');
  assert.equal(sync.data.size, 0);
});

test('allPins groups by repo and skips empty entries', async () => {
  const store = createStore(new FakeApi());
  await store.setPins('acme/widgets', ['ci.yaml']);
  await store.setPins('acme/gadgets', ['deploy.yaml', 'e2e.yaml']);
  await store.setPins('acme/empty', []);
  assert.deepEqual(await store.allPins(), {
    'acme/widgets': ['ci.yaml'],
    'acme/gadgets': ['deploy.yaml', 'e2e.yaml'],
  });
});

test('export then import restores the pins', async () => {
  const source = createStore(new FakeApi());
  await source.setPins('acme/widgets', ['ci.yaml', 'e2e.yaml']);
  const payload = await source.exportAll();

  const target = createStore(new FakeApi());
  assert.equal(await target.importAll(payload), 1);
  assert.deepEqual(await target.getPins('acme/widgets'), ['ci.yaml', 'e2e.yaml']);
});

test('import merges and never removes an existing pin', async () => {
  const store = createStore(new FakeApi());
  await store.setPins('acme/widgets', ['local-only.yaml']);
  await store.importAll({ version: 1, pins: { 'acme/widgets': ['ci.yaml'] } });
  assert.deepEqual(await store.getPins('acme/widgets'), ['local-only.yaml', 'ci.yaml']);
});

test('import with replace drops what the file omits', async () => {
  const store = createStore(new FakeApi());
  await store.setPins('acme/widgets', ['local-only.yaml']);
  await store.setPins('acme/gadgets', ['gone.yaml']);
  await store.importAll({ version: 1, pins: { 'acme/widgets': ['ci.yaml'] } }, { replace: true });
  assert.deepEqual(await store.getPins('acme/widgets'), ['ci.yaml']);
  assert.deepEqual(await store.getPins('acme/gadgets'), []);
});

test('import rejects a file that is not an export', async () => {
  const store = createStore(new FakeApi());
  await assert.rejects(() => store.importAll({ nope: true }), /missing a "pins" object/);
});

test('switching to local carries the pins over', async () => {
  const api = new FakeApi();
  const store = createStore(api);
  await store.setPins('acme/widgets', ['ci.yaml']);
  assert.equal(await store.activeAreaName(), 'sync');

  assert.equal(await store.switchArea('local'), 1);

  assert.equal(await store.activeAreaName(), 'local');
  assert.deepEqual(await store.getPins('acme/widgets'), ['ci.yaml']);
  assert.deepEqual(await api.storage.local.get('pins:acme/widgets'), {
    'pins:acme/widgets': ['ci.yaml'],
  });
});

test('clearAll removes pins but keeps settings', async () => {
  const store = createStore(new FakeApi());
  await store.setSettings({ area: 'local' });
  await store.setPins('acme/widgets', ['ci.yaml']);
  assert.equal(await store.clearAll(), 1);
  assert.deepEqual(await store.allPins(), {});
  assert.deepEqual(await store.getSettings(), { area: 'local' });
});

test('a pin written during a sync outage is still readable once sync recovers', async () => {
  const sync = new FakeStorageArea({ failWrites: true });
  const local = new FakeStorageArea();
  const store = createStore(new FakeApi({ sync, local }));

  await store.togglePin('acme/widgets', 'ci.yaml');
  sync.failWrites = false;

  assert.deepEqual(await store.getPins('acme/widgets'), ['ci.yaml']);
  assert.deepEqual(await store.allPins(), { 'acme/widgets': ['ci.yaml'] });
});

test('normal use writes no keys beyond the pins themselves', async () => {
  const api = new FakeApi();
  const store = createStore(api);
  await store.togglePin('acme/widgets', 'ci.yaml');
  assert.deepEqual([...api.storage.sync.data.keys()], ['pins:acme/widgets']);
});

test('unpinning the last workflow removes the repo key', async () => {
  const api = new FakeApi();
  const store = createStore(api);
  await store.togglePin('acme/widgets', 'ci.yaml');
  await store.togglePin('acme/widgets', 'ci.yaml');
  assert.equal(api.storage.sync.data.has('pins:acme/widgets'), false);
});

test('no group starts collapsed', async () => {
  const store = createStore(new FakeApi());
  assert.deepEqual(await store.getCollapsed(), {});
});

test('collapsing a group persists, and each group is independent', async () => {
  const store = createStore(new FakeApi());
  await store.setCollapsed('all', true);
  assert.deepEqual(await store.getCollapsed(), { all: true });
  await store.setCollapsed('favorites', true);
  assert.deepEqual(await store.getCollapsed(), { all: true, favorites: true });
  await store.setCollapsed('all', false);
  assert.deepEqual(await store.getCollapsed(), { all: false, favorites: true });
});

test('collapsed state stays local and out of the pin export', async () => {
  const api = new FakeApi();
  const store = createStore(api);
  await store.setCollapsed('all', true);
  await store.setPins('acme/widgets', ['ci.yaml']);

  assert.equal(api.storage.sync.data.has('__collapsed'), false);
  assert.deepEqual(Object.keys(await store.exportAll()), ['version', 'settings', 'pins']);
});

test('clearing pins leaves the collapsed groups alone', async () => {
  const store = createStore(new FakeApi());
  await store.setCollapsed('all', true);
  await store.setPins('acme/widgets', ['ci.yaml']);
  await store.clearAll();
  assert.deepEqual(await store.getCollapsed(), { all: true });
});

test('an unseen repo has no cached names', async () => {
  const store = createStore(new FakeApi());
  assert.deepEqual(await store.getNames('acme/widgets'), {});
});

test('remembering names merges rather than replaces', async () => {
  const store = createStore(new FakeApi());
  await store.rememberNames('acme/widgets', { 'ci.yaml': 'CI' });
  await store.rememberNames('acme/widgets', { 'e2e.yaml': 'E2E tests' });
  assert.deepEqual(await store.getNames('acme/widgets'), { 'ci.yaml': 'CI', 'e2e.yaml': 'E2E tests' });
});

test('a renamed workflow overwrites its cached name', async () => {
  const store = createStore(new FakeApi());
  await store.rememberNames('acme/widgets', { 'ci.yaml': 'CI' });
  await store.rememberNames('acme/widgets', { 'ci.yaml': 'Continuous Integration' });
  assert.deepEqual(await store.getNames('acme/widgets'), { 'ci.yaml': 'Continuous Integration' });
});

test('forgetting names drops only the ones named', async () => {
  const store = createStore(new FakeApi());
  await store.rememberNames('acme/widgets', { 'ci.yaml': 'CI', 'e2e.yaml': 'E2E', 'old.yaml': 'Old' });
  await store.forgetNames('acme/widgets', ['old.yaml']);
  assert.deepEqual(await store.getNames('acme/widgets'), { 'ci.yaml': 'CI', 'e2e.yaml': 'E2E' });
});

test('names are cached per repo', async () => {
  const store = createStore(new FakeApi());
  await store.rememberNames('acme/widgets', { 'ci.yaml': 'CI' });
  assert.deepEqual(await store.getNames('acme/gadgets'), {});
});

test('the name cache stays local and out of the export', async () => {
  const api = new FakeApi();
  const store = createStore(api);
  await store.rememberNames('acme/widgets', { 'ci.yaml': 'CI' });
  await store.setPins('acme/widgets', ['ci.yaml']);

  assert.equal(api.storage.sync.data.has('names:acme/widgets'), false);
  assert.deepEqual(await store.exportAll(), {
    version: 1,
    settings: { area: 'sync' },
    pins: { 'acme/widgets': ['ci.yaml'] },
  });
});

test('clearing pins leaves the name cache alone', async () => {
  const store = createStore(new FakeApi());
  await store.rememberNames('acme/widgets', { 'ci.yaml': 'CI' });
  await store.setPins('acme/widgets', ['ci.yaml']);
  await store.clearAll();
  assert.deepEqual(await store.getNames('acme/widgets'), { 'ci.yaml': 'CI' });
});
