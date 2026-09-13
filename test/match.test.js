'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { matchesQuery, groupRows, visibleGroups, GROUP_TITLES } = require('../src/match.js');

test('an empty query matches everything', () => {
  assert.equal(matchesQuery('Test / Branch / E2E-Simple-Call', ''), true);
  assert.equal(matchesQuery('anything', '   '), true);
});

test('matching ignores case', () => {
  assert.equal(matchesQuery('Deploy Services', 'deploy'), true);
  assert.equal(matchesQuery('deploy services', 'DEPLOY'), true);
});

test('every term must appear, in any order', () => {
  const label = 'Test / Branch / E2E-Simple-Call';
  assert.equal(matchesQuery(label, 'e2e call'), true);
  assert.equal(matchesQuery(label, 'call e2e'), true);
  assert.equal(matchesQuery(label, 'e2e deploy'), false);
});

test('a term may match the filename as well as the label', () => {
  assert.equal(matchesQuery('E2E Simple Call e2e-simple-call.yaml', 'yaml'), true);
});

test('a non-matching query matches nothing', () => {
  assert.equal(matchesQuery('Deploy Services', 'android'), false);
});

const rowsFor = (...ids) => ids.map((id) => ({ id }));
const idsIn = (groups, key) => groups.find((g) => g.key === key).rows.map((r) => r.id);

test('with no favorites everything lands in one group', () => {
  const groups = groupRows(rowsFor('a.yaml', 'b.yaml'));
  assert.deepEqual(idsIn(groups, 'favorites'), []);
  assert.deepEqual(idsIn(groups, 'all'), ['a.yaml', 'b.yaml']);
});

test('favorites are their own group, in the order the user picked them', () => {
  const groups = groupRows(rowsFor('a.yaml', 'b.yaml', 'c.yaml'), { favorites: ['c.yaml', 'a.yaml'] });
  assert.deepEqual(idsIn(groups, 'favorites'), ['c.yaml', 'a.yaml']);
  assert.deepEqual(idsIn(groups, 'all'), ['b.yaml']);
});

test('a workflow appears in exactly one group', () => {
  const groups = groupRows(rowsFor('a.yaml', 'b.yaml'), { favorites: ['a.yaml'] });
  const everywhere = groups.flatMap((g) => g.rows.map((r) => r.id));
  assert.deepEqual(everywhere, [...new Set(everywhere)]);
});

test('the groups stay in sidebar order: favorites, then everything else', () => {
  const groups = groupRows(rowsFor('a.yaml'), { favorites: ['a.yaml'] });
  assert.deepEqual(groups.map((g) => g.key), ['favorites', 'all']);
});

test('unfavorited rows keep the order GitHub gave them', () => {
  const groups = groupRows(rowsFor('a.yaml', 'b.yaml', 'c.yaml', 'd.yaml'), { favorites: ['c.yaml'] });
  assert.deepEqual(idsIn(groups, 'all'), ['a.yaml', 'b.yaml', 'd.yaml']);
});

test('a favorite for a workflow that no longer exists is ignored', () => {
  const groups = groupRows(rowsFor('a.yaml'), { favorites: ['deleted.yaml', 'a.yaml'] });
  assert.deepEqual(idsIn(groups, 'favorites'), ['a.yaml']);
});

test('empty groups do not reach the sidebar', () => {
  const visible = visibleGroups(groupRows(rowsFor('a.yaml', 'b.yaml')));
  assert.deepEqual(visible.map((g) => g.key), ['all']);
});

test('a single surviving group loses its header, because it labels nothing', () => {
  const visible = visibleGroups(groupRows(rowsFor('a.yaml', 'b.yaml')));
  assert.equal(visible.length, 1);
  assert.equal(visible[0].title, null);
});

test('both groups keep their headers once something is favorited', () => {
  const visible = visibleGroups(groupRows(rowsFor('a.yaml', 'b.yaml'), { favorites: ['a.yaml'] }));
  assert.deepEqual(visible.map((g) => g.title), [GROUP_TITLES.favorites, GROUP_TITLES.all]);
});

test('favoriting every workflow leaves one unlabelled group', () => {
  const visible = visibleGroups(groupRows(rowsFor('a.yaml'), { favorites: ['a.yaml'] }));
  assert.equal(visible.length, 1);
  assert.equal(visible[0].title, null);
});
