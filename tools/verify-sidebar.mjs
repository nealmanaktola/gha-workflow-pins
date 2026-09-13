// Browser checks for the parts unit tests cannot reach: the sidebar DOM.
// Needs Playwright's own Chromium, because Chrome 137+ ignores --load-extension.
//   npm i -D playwright && npx playwright install chromium
import { chromium } from 'playwright';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const EXT = process.env.EXT_DIR || path.resolve(import.meta.dirname, '..');
const REPO = process.env.TARGET_REPO || 'home-assistant/core';
const URL = `https://github.com/${REPO}/actions`;

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ghapin-verify-'));
const context = await chromium.launchPersistentContext(profile, {
  headless: false,
  viewport: { width: 1440, height: 1000 },
  args: [
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
  ],
});
const page = context.pages()[0] || (await context.newPage());

const state = () =>
  page.evaluate(() => ({
    rows: document.querySelectorAll('.ghapin-row').length,
    headers: [...document.querySelectorAll('.ghapin-header')].map((h) => ({
      title: h.querySelector('h3')?.textContent,
      group: h.getAttribute('data-ghapin-group'),
      shown: h.style.display !== 'none',
    })),
    favorites: document.querySelectorAll('.ghapin-row[data-ghapin-group="favorites"]').length,
    visible: [...document.querySelectorAll('.ghapin-row')].filter((r) => r.style.display !== 'none')
      .length,
    count: document.querySelector('.ghapin-count')?.textContent,
    cached: document.querySelectorAll('[data-ghapin-cached]').length,
    overlaps: [...document.querySelectorAll('.ghapin-row')].slice(0, 40).flatMap((row) => {
      const star = row.querySelector('.ghapin-star');
      if (!star) return [];
      const s = star.getBoundingClientRect();
      return [...row.querySelectorAll('*')]
        .filter((el) => el !== star && !star.contains(el) && el.offsetParent !== null)
        .filter((el) => {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) return false;
          // GitHub's own icons, not the row's link, which the star sits inside.
          if (el.tagName === 'A' || el.tagName === 'SPAN') return false;
          return r.left < s.right && r.right > s.left && r.top < s.bottom && r.bottom > s.top;
        })
        .map((el) => el.tagName.toLowerCase());
    }),
  }));

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.ghapin-filter', { timeout: 30000 });
await page
  .waitForFunction(() => document.querySelector('.ghapin-count')?.textContent !== 'loading…', {
    timeout: 40000,
  })
  .catch(() => {});

const loaded = await state();
check('every page of workflows is loaded', loaded.rows > 10, `${loaded.rows} rows`);
check('no star overlaps a GitHub icon', loaded.overlaps.length === 0, loaded.overlaps.join(', '));

// Star three workflows, including one GitHub does not put on the first page.
const ids = await page.evaluate(() =>
  [...document.querySelectorAll('.ghapin-row a[href*="/actions/workflows/"]')]
    .slice(-3)
    .map((a) => decodeURIComponent(a.getAttribute('href').split('/actions/workflows/')[1]))
);
for (const id of ids) {
  await page
    .locator(`.ghapin-row:has(a[href$="/actions/workflows/${id}"]) .ghapin-star`)
    .first()
    .click({ force: true });
  await page.waitForTimeout(300);
}

const starred = await state();
check('favorites group fills', starred.favorites === ids.length, `${starred.favorites}/${ids.length}`);
check(
  'both headers render',
  starred.headers.length === 2 && starred.headers.every((h) => h.title),
  starred.headers.map((h) => h.title).join(' + ') || 'none'
);

// The regression: a render that changes nothing must not strip the headers.
// The poke has to land inside the sidebar, because that is the only thing the
// observer watches. Poking the document body triggers no render at all, and a
// check that triggers no render cannot catch anything.
await page.evaluate(() => {
  const row = document.querySelector('.ghapin-row');
  const list = row?.parentElement;
  if (!list) throw new Error('no sidebar list to poke');
  const poke = document.createElement('li');
  poke.id = 'ghapin-poke';
  list.append(poke);
  poke.remove();
});
await page.waitForTimeout(1500);
const afterIdle = await state();
check(
  'headers survive a no-op render',
  afterIdle.headers.length === 2,
  `${afterIdle.headers.length} headers after idle`
);

await page.locator('.ghapin-filter').fill('build');
await page.waitForTimeout(400);
const filtered = await state();
check('filter narrows the list', filtered.visible < afterIdle.rows, filtered.count);
check('headers survive filtering', filtered.headers.length === 2, `${filtered.headers.length}`);

await page.locator('.ghapin-filter').fill('');
await page.waitForTimeout(400);

const toggle = page.locator('.ghapin-header[data-ghapin-group="all"] .ghapin-header-toggle');
const clicked = await toggle
  .click({ timeout: 5000 })
  .then(() => true)
  .catch(() => false);
await page.waitForTimeout(400);
const collapsed = await state();
check('the All workflows header is clickable', clicked, clicked ? '' : 'header not in the DOM');
check(
  'collapsing hides only that group',
  clicked && collapsed.visible === ids.length,
  `${collapsed.visible} visible, expected ${ids.length}`
);
check('headers survive collapsing', collapsed.headers.length === 2, `${collapsed.headers.length}`);

// Reload: favorites must come back from cache, and placeholders must go away.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.ghapin-filter', { timeout: 30000 });
await page
  .waitForFunction(() => document.querySelector('.ghapin-count')?.textContent !== 'loading…', {
    timeout: 40000,
  })
  .catch(() => {});
const reloaded = await state();
check('favorites persist across a reload', reloaded.favorites === ids.length, `${reloaded.favorites}`);
check('no cached placeholders are left behind', reloaded.cached === 0, `${reloaded.cached}`);
check('headers survive a reload', reloaded.headers.length === 2, `${reloaded.headers.length}`);

// Favoriting one workflow must leave the header standing. A storage-change
// echo of this tab's own write used to clear the favorites a moment later,
// so the header appeared and then vanished. Anything that settles late shows
// up here, which a check taken straight after the click would miss.
// A second repository, so this starts with no favorites. Favorites are stored
// per repository, and reusing the first one meant clicking the leading star
// removed a favorite instead of adding one.
const SOLO_REPO = process.env.SOLO_REPO || 'home-assistant/frontend';
const solo = await context.newPage();
await solo.goto(`https://github.com/${SOLO_REPO}/actions`, { waitUntil: 'domcontentloaded' });
await solo.waitForSelector('.ghapin-filter', { timeout: 30000 });
await solo
  .waitForFunction(() => document.querySelector('.ghapin-count')?.textContent !== 'loading…', {
    timeout: 40000,
  })
  .catch(() => {});

const readSolo = () =>
  solo.evaluate(() => ({
    headers: [...document.querySelectorAll('.ghapin-header')]
      .filter((h) => h.style.display !== 'none')
      .map((h) => h.querySelector('h3')?.textContent),
    favorites: document.querySelectorAll('.ghapin-row[data-ghapin-group="favorites"]').length,
  }));

const before = await solo.evaluate(() => ({
  favorites: document.querySelectorAll('.ghapin-row[data-ghapin-group="favorites"]').length,
  visible: [...document.querySelectorAll('.ghapin-row')].filter((r) => r.style.display !== 'none')
    .length,
}));
check('the second repository starts with no favorites', before.favorites === 0, `${before.favorites}`);
// A group collapsed on another repository must not hide a list that has no
// header to expand it again.
check(
  'a repository with no favorites still shows its workflows',
  before.visible > 0,
  `${before.visible} visible`
);
await solo.locator('.ghapin-row .ghapin-star').first().click({ force: true });
await solo.waitForTimeout(400);
const justAfter = await readSolo();
check('header appears when the first favorite is added', justAfter.headers.length === 2, justAfter.headers.join(' + '));

await solo.waitForTimeout(4000);
const settled = await readSolo();
check(
  'the header is still there four seconds later',
  settled.headers.length === 2,
  settled.headers.join(' + ') || 'no headers'
);
check('the favorite is still there four seconds later', settled.favorites === 1, `${settled.favorites}`);

// A failed partial load must not take the favorites, or the headers, with it.
// This is what Firefox does until the user grants access to github.com.
const blocked = await context.newPage();
await blocked.route('**/actions/workflows_partial*', (route) => route.abort());
await blocked.goto(URL, { waitUntil: 'domcontentloaded' });
await blocked.waitForSelector('.ghapin-filter', { timeout: 30000 });
await blocked.waitForTimeout(4000);

const offline = await blocked.evaluate(() => ({
  favorites: document.querySelectorAll('.ghapin-row[data-ghapin-group="favorites"]').length,
  headers: document.querySelectorAll('.ghapin-header').length,
  showMoreVisible: !document.querySelector('[data-target="nav-list-group.showMoreItem"]')?.hidden,
}));
check(
  'favorites survive a failed workflow-list load',
  offline.favorites === ids.length,
  `${offline.favorites}/${ids.length}`
);
check('headers survive a failed load', offline.headers >= 1, `${offline.headers}`);
check(
  'GitHub\'s own Show more stays available after a failed load',
  offline.showMoreVisible,
  offline.showMoreVisible ? '' : 'button was hidden with nothing to replace it'
);

await context.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
