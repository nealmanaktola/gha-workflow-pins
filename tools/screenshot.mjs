// Retakes the README screenshots against a live public repository, and
// reports whether the star overlaps anything GitHub draws in a row.
// Needs Playwright's own Chromium: Chrome 137+ ignores --load-extension.
import { chromium } from 'playwright';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const EXT = process.env.EXT_DIR || path.resolve(import.meta.dirname, '..');
const REPO = process.env.TARGET_REPO || 'home-assistant/core';
const OUT = process.env.OUT_DIR || path.resolve(import.meta.dirname, '../docs');
const FAVORITES = (process.env.FAVORITES || 'ci.yaml,builder.yml,codeql.yml').split(',');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ghapin-profile-'));
fs.mkdirSync(OUT, { recursive: true });

const context = await chromium.launchPersistentContext(profile, {
  channel: undefined,
  headless: false,
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 2,
  args: [
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

const page = context.pages()[0] || (await context.newPage());
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`https://github.com/${REPO}/actions`, { waitUntil: 'domcontentloaded' });

// The filter box only exists once the content script has rendered.
await page.waitForSelector('.ghapin-filter', { timeout: 30000 });
await page.waitForFunction(
  () => document.querySelector('.ghapin-count')?.textContent !== 'loading…',
  { timeout: 30000 }
);

const report = async (label) => {
  const data = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.ghapin-row')];
    const headers = [...document.querySelectorAll('.ghapin-header')];
    return {
      rows: rows.length,
      visible: rows.filter((r) => r.style.display !== 'none').length,
      count: document.querySelector('.ghapin-count')?.textContent,
      headers: headers.map((h) => ({
        title: h.querySelector('h3')?.textContent,
        count: h.querySelector('.ghapin-group-count')?.textContent,
        shown: h.style.display !== 'none',
      })),
      // Does the star land on top of anything GitHub already drew?
      overlaps: rows.slice(0, 40).flatMap((row) => {
        const star = row.querySelector('.ghapin-star');
        if (!star) return [];
        const s = star.getBoundingClientRect();
        return [...row.querySelectorAll('*')]
          .filter((el) => el !== star && !star.contains(el) && el.offsetParent !== null)
          .filter((el) => {
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) return false;
            return r.left < s.right && r.right > s.left && r.top < s.bottom && r.bottom > s.top;
          })
          .map((el) => `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`);
      }),
    };
  });
  console.log(`\n[${label}]`, JSON.stringify({ ...data, overlaps: [...new Set(data.overlaps)] }, null, 2));
  return data;
};

await report('loaded');

// Star a few workflows so the "My favorites" group has something in it.
for (const id of FAVORITES) {
  const star = page.locator(`.ghapin-row:has(a[href$="/actions/workflows/${id}"]) .ghapin-star`).first();
  if (await star.count()) {
    await star.click({ force: true });
    await page.waitForTimeout(350);
  } else {
    console.log(`  (no row for ${id})`);
  }
}
await page.waitForTimeout(700);
await report('after starring');

const pane = page.locator('.ghapin-filter-wrap').locator('xpath=..');

// Clip the tall shot. The whole sidebar runs past 1800px, which reads as an
// endless scroll in a README and dwarfs every other image on the page.
const shotOf = async (name, maxHeight) => {
  const box = await pane.boundingBox();
  await page.screenshot({
    path: path.join(OUT, name),
    clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, maxHeight) },
  });
};

await shotOf('screenshot-sidebar.png', 560);

// The filter, mid-search.
await page.locator('.ghapin-filter').fill('build');
await page.waitForTimeout(500);
await report('filtering "build"');
await shotOf('screenshot-filter.png', 560);

await page.locator('.ghapin-filter').fill('');
await page.waitForTimeout(400);

// Collapsed "All workflows".
const allHeader = page.locator('.ghapin-header[data-ghapin-group="all"] .ghapin-header-toggle');
if (await allHeader.count()) {
  await allHeader.click();
  await page.waitForTimeout(500);
  await report('all collapsed');
  await shotOf('screenshot-collapsed.png', 560);
}

console.log('\nconsole errors:', errors.length ? errors : 'none');
console.log('wrote:', fs.readdirSync(OUT).join(', '));
await context.close();
