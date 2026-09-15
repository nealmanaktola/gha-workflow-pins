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

function removedBlock(slug, entries, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'repo';

  const title = document.createElement('h3');
  title.textContent = slug;

  const list = document.createElement('ul');
  list.className = 'pin-list';
  for (const [id, entry] of Object.entries(entries)) {
    const li = document.createElement('li');

    const name = document.createElement('span');
    const when = entry.at ? new Date(entry.at).toLocaleDateString() : '';
    name.textContent = when ? `${entry.label || id} — dropped ${when}` : entry.label || id;

    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'link-button';
    restore.textContent = 'Restore';
    restore.addEventListener('click', async () => {
      await GhaStore.restoreRemoved(slug, [id]);
      say(`Restored ${entry.label || id}.`);
      onChange();
    });

    li.append(name, restore);
    list.append(li);
  }

  wrap.append(title, list);
  return wrap;
}

async function renderRemoved() {
  const section = $('removed-section');
  const container = $('removed');
  container.replaceChildren();
  const removed = await GhaStore.allRemoved();
  const slugs = Object.keys(removed).sort();
  section.hidden = !slugs.length;
  for (const slug of slugs) container.append(removedBlock(slug, removed[slug], refresh));
}

// Firefox treats host permissions as optional, so the extension cannot fetch
// the workflow list until the user grants access. A published extension cannot
// rely on anyone reading a README, so it has to be askable from here.
const GITHUB_ORIGIN = 'https://github.com/*';

async function renderAccess() {
  const section = $('access-section');
  if (!GhaApi.permissions?.contains) {
    section.hidden = true;
    return;
  }
  const granted = await GhaApi.permissions.contains({ origins: [GITHUB_ORIGIN] }).catch(() => true);
  section.hidden = granted;
  $('access-state').textContent = granted ? 'Granted.' : 'Not granted yet.';
}

$('grant').addEventListener('click', async () => {
  try {
    const granted = await GhaApi.permissions.request({ origins: [GITHUB_ORIGIN] });
    say(granted ? 'Granted. Reload any open GitHub tab.' : 'Not granted. The fallback still works.');
  } catch (error) {
    say(`Could not ask for access: ${error.message}`);
  }
  await renderAccess();
});

async function refresh() {
  const settings = await GhaStore.getSettings();
  $('sync').checked = settings.area === 'sync';
  $('area').textContent = await GhaStore.activeAreaName();
  await renderPins();
  await renderRemoved();
  await renderAccess();
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
