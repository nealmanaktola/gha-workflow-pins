'use strict';

const repoFromUrl = (url) => {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'github.com') return null;
    const m = parsed.pathname.match(/^\/([^/]+)\/([^/]+)(?:\/|$)/);
    return m ? `${m[1]}/${m[2]}` : null;
  } catch {
    return null;
  }
};

function row(slug, id) {
  const li = document.createElement('li');
  const link = document.createElement('a');
  link.href = `https://github.com/${slug}/actions/workflows/${encodeURIComponent(id)}`;
  link.textContent = id;
  link.target = '_blank';
  link.rel = 'noreferrer';

  const unpin = document.createElement('button');
  unpin.type = 'button';
  unpin.className = 'link-button';
  unpin.textContent = 'Unpin';
  unpin.addEventListener('click', async () => {
    await GhaStore.togglePin(slug, id);
    load();
  });

  li.append(link, unpin);
  return li;
}

async function load() {
  const [tab] = await GhaApi.tabs.query({ active: true, currentWindow: true });
  const slug = repoFromUrl(tab?.url || '');
  const list = document.getElementById('list');
  const empty = document.getElementById('empty');
  list.replaceChildren();

  if (!slug) {
    document.getElementById('repo').textContent = 'Pinned workflows';
    empty.hidden = false;
    empty.textContent = 'Open a GitHub repository to see its pins.';
    return;
  }

  document.getElementById('repo').textContent = slug;
  const pins = await GhaStore.getPins(slug);
  if (!pins.length) {
    empty.hidden = false;
    empty.textContent = 'No pins here yet. Star a workflow in the Actions sidebar.';
    return;
  }
  empty.hidden = true;
  for (const id of pins) list.append(row(slug, id));
}

document.getElementById('options').addEventListener('click', (event) => {
  event.preventDefault();
  GhaApi.runtime.openOptionsPage();
});

load();
