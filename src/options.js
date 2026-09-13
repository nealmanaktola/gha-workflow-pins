'use strict';

const $ = (id) => document.getElementById(id);

let statusTimer = null;
function say(message) {
  const el = $('status');
  el.textContent = message;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    el.textContent = '';
  }, 4000);
}

function repoBlock(slug, ids, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'repo';

  const title = document.createElement('h3');
  const link = document.createElement('a');
  link.href = `https://github.com/${slug}/actions`;
  link.textContent = slug;
  link.target = '_blank';
  link.rel = 'noreferrer';
  title.append(link);

  const list = document.createElement('ul');
  list.className = 'pin-list';
  for (const id of ids) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = id;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'link-button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      await GhaStore.togglePin(slug, id);
      onChange();
    });

    li.append(name, remove);
    list.append(li);
  }

  wrap.append(title, list);
  return wrap;
}

async function renderPins() {
  const container = $('all');
  container.replaceChildren();
  const pins = await GhaStore.allPins();
  const slugs = Object.keys(pins).sort();
  if (!slugs.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Nothing pinned yet.';
    container.append(p);
    return;
  }
  for (const slug of slugs) container.append(repoBlock(slug, pins[slug], refresh));
}

async function refresh() {
  const settings = await GhaStore.getSettings();
  $('sync').checked = settings.area === 'sync';
  $('area').textContent = await GhaStore.activeAreaName();
  await renderPins();
}

$('sync').addEventListener('change', async (event) => {
  const moved = await GhaStore.switchArea(event.target.checked ? 'sync' : 'local');
  const where = await GhaStore.activeAreaName();
  if (event.target.checked && where !== 'sync') {
    say('Sync is not available in this browser profile. Pins stay local.');
  } else {
    say(`Storing in ${where}. Moved ${moved} repo${moved === 1 ? '' : 's'}.`);
  }
  await refresh();
});

$('export').addEventListener('click', async () => {
  const payload = await GhaStore.exportAll();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'gha-workflow-pins.json';
  a.click();
  URL.revokeObjectURL(url);
  say('Exported.');
});

$('import').addEventListener('click', () => $('file').click());

$('file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const count = await GhaStore.importAll(JSON.parse(await file.text()));
    say(`Imported pins for ${count} repo${count === 1 ? '' : 's'}.`);
    await refresh();
  } catch (error) {
    say(`Import failed: ${error.message}`);
  } finally {
    event.target.value = '';
  }
});

$('clear').addEventListener('click', async () => {
  if (!confirm('Remove every pin? This cannot be undone.')) return;
  const removed = await GhaStore.clearAll();
  say(`Cleared ${removed} repo${removed === 1 ? '' : 's'}.`);
  await refresh();
});

refresh();
