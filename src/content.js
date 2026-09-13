'use strict';

(() => {
  const STAR_CLASS = 'ghapin-star';
  const ROW_CLASS = 'ghapin-row';
  const WRAP_CLASS = 'ghapin-filter-wrap';
  const HEADER_CLASS = 'ghapin-header';
  const GROUP_ATTR = 'data-ghapin-group';
  const WORKFLOW_PATH = /^\/[^/]+\/[^/]+\/actions\/workflows\/.+$/;
  const SHOW_MORE = '[data-target="nav-list-group.showMoreItem"]';
  const MAX_PAGES = 30;

  let observer = null;
  let rendering = false;
  let loading = null;
  let loadedAll = false;
  let favorites = [];
  let collapsed = {};

  const repoSlug = () => {
    const m = location.pathname.match(/^\/([^/]+)\/([^/]+)(?:\/|$)/);
    return m ? `${m[1]}/${m[2]}` : null;
  };

  // The script is injected across github.com, because GitHub navigates with
  // Turbo and a narrower match would never inject when the user arrives at
  // Actions from another page. Everywhere else it does nothing.
  const onActionsPage = () => /^\/[^/]+\/[^/]+\/actions(?:\/|$)/.test(location.pathname);

  // The path after /actions/workflows/ identifies the workflow. It is usually
  // a filename, but Copilot and Dependabot entries add a path segment.
  const workflowId = (anchor) => {
    const path = new URL(anchor.href, location.origin).pathname;
    return decodeURIComponent(path.split('/actions/workflows/')[1] || '');
  };

  const isWorkflowLink = (a) => WORKFLOW_PATH.test(new URL(a.href, location.origin).pathname);

  const workflowAnchors = (root) =>
    [...root.querySelectorAll('a[href*="/actions/workflows/"]')].filter(isWorkflowLink);

  // The sidebar is the element holding the most workflow links. Deriving it
  // this way survives GitHub renaming its CSS classes, which it does often.
  function findList() {
    const counts = new Map();
    for (const anchor of workflowAnchors(document)) {
      const row = anchor.closest('li') || anchor.parentElement;
      if (!row) continue;
      const parent = row.parentElement;
      if (!parent) continue;
      const entry = counts.get(parent) || new Map();
      if (!entry.has(row)) entry.set(row, anchor);
      counts.set(parent, entry);
    }

    let container = null;
    let best = 0;
    for (const [el, entry] of counts) {
      if (entry.size > best) {
        best = entry.size;
        container = el;
      }
    }
    if (!container) return null;

    const rows = [...counts.get(container)].map(([el, anchor]) => ({
      el,
      id: workflowId(anchor),
      label: (anchor.textContent || '').trim(),
    }));
    return { container, rows };
  }

  // GitHub paginates the sidebar and only renders the first page. Pull the
  // remaining pages from the same partial endpoint its "Show more" button
  // uses, so the filter searches every workflow instead of the first ten.
  async function loadAllWorkflows(container) {
    const more = document.querySelector(SHOW_MORE);
    const src = more?.getAttribute('src');
    if (!more || !src) {
      loadedAll = true;
      return 0;
    }

    const seen = new Set(workflowAnchors(container).map(workflowId));
    let page = Number(more.getAttribute('data-current-page') || '1');
    let added = 0;

    for (let step = 0; step < MAX_PAGES; step += 1) {
      page += 1;
      const url = new URL(src, location.origin);
      url.searchParams.set('page', String(page));

      let doc;
      try {
        const response = await fetch(url.toString(), {
          credentials: 'same-origin',
          headers: { Accept: 'text/html' },
        });
        if (!response.ok) break;
        doc = new DOMParser().parseFromString(`<ul>${await response.text()}</ul>`, 'text/html');
      } catch {
        break;
      }

      for (const node of doc.querySelectorAll('script, style, link')) node.remove();
      const items = [...doc.querySelectorAll('li')].filter((li) => workflowAnchors(li).length);
      // An empty page is the only dependable end marker. A partial can carry a
      // full page of workflows and still omit the show-more element, so that
      // element says nothing about whether another page follows.
      if (!items.length) break;

      for (const item of items) {
        const id = workflowId(workflowAnchors(item)[0]);
        if (seen.has(id)) continue;
        seen.add(id);
        container.append(document.importNode(item, true));
        added += 1;
      }
    }

    loadedAll = true;
    more.setAttribute('hidden', 'hidden');
    more.style.display = 'none';
    return added;
  }

  function buildStar(row, pinned, onToggle) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = STAR_CLASS;
    btn.setAttribute('aria-pressed', String(pinned));
    btn.setAttribute('aria-label', (pinned ? 'Remove from my favorites: ' : 'Add to my favorites: ') + row.label);
    btn.title = pinned ? 'Remove from my favorites' : 'Add to my favorites (only you see this)';
    btn.textContent = pinned ? '★' : '☆';
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onToggle(row.id);
    });
    return btn;
  }

  // The star goes at the leading edge. GitHub owns the trailing edge of a row
  // and puts its own badges there without warning, so competing for that space
  // is a losing game. The CSS reserves the leading space on every row, which
  // keeps the labels aligned whether a row shows a star or not.
  function decorate(row, el, onToggle) {
    el.classList.add(ROW_CLASS);
    for (const stale of el.querySelectorAll(`.${STAR_CLASS}`)) stale.remove();
    el.append(buildStar(row, favorites.includes(row.id), onToggle));
  }

  function buildHeader(group, onToggleCollapse) {
    const li = document.createElement('li');
    li.className = `${HEADER_CLASS} ActionList-sectionDivider`;
    li.setAttribute('role', 'presentation');
    li.setAttribute(GROUP_ATTR, group.key);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ghapin-header-toggle';
    button.setAttribute('aria-expanded', String(!collapsed[group.key]));

    const chevron = document.createElement('span');
    chevron.className = 'ghapin-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '▾';

    const title = document.createElement('h3');
    title.className = 'ActionList-sectionDivider-title';
    title.textContent = group.title;

    const count = document.createElement('span');
    count.className = 'ghapin-group-count';

    button.append(chevron, title, count);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      onToggleCollapse(group.key);
    });

    li.append(button);
    return li;
  }

  function buildFilter(model) {
    const wrap = document.createElement('div');
    wrap.className = WRAP_CLASS;

    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'ghapin-filter';
    input.placeholder = 'Filter workflows…';
    input.setAttribute('aria-label', 'Filter workflows');

    const count = document.createElement('span');
    count.className = 'ghapin-count';

    wrap.append(input, count);
    model.container.parentElement.insertBefore(wrap, model.container);

    input.addEventListener('input', () => applyFilter(input.value));
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      input.value = '';
      applyFilter('');
    });
    return wrap;
  }

  function applyFilter(query) {
    const container = document.querySelector(`.${WRAP_CLASS}`)?.nextElementSibling;
    if (!container) return;
    const searching = Boolean(query.trim());

    const matched = new Map();
    const distinct = new Set();
    for (const el of container.querySelectorAll(`.${ROW_CLASS}`)) {
      const anchor = workflowAnchors(el)[0];
      if (!anchor) continue;
      const id = workflowId(anchor);
      const hit = matchesQuery(`${(anchor.textContent || '').trim()} ${id}`, query);
      const key = el.getAttribute(GROUP_ATTR);
      // A group the user rolled up stays rolled up, unless they are searching.
      // A search that hides its own results is not a search.
      const hidden = !hit || (collapsed[key] && !searching);
      el.style.display = hidden ? 'none' : '';
      if (!hit) continue;
      matched.set(key, (matched.get(key) || 0) + 1);
      distinct.add(id);
    }

    for (const header of container.querySelectorAll(`.${HEADER_CLASS}`)) {
      const key = header.getAttribute(GROUP_ATTR);
      const hits = matched.get(key) || 0;
      header.style.display = hits ? '' : 'none';
      header.querySelector('.ghapin-group-count').textContent = String(hits);
      const open = !collapsed[key] || searching;
      header.querySelector('.ghapin-header-toggle').setAttribute('aria-expanded', String(open));
      header.classList.toggle('ghapin-header--collapsed', !open);
    }

    const count = document.querySelector(`.${WRAP_CLASS} .ghapin-count`);
    if (!count) return;
    const total = new Set(
      [...container.querySelectorAll(`.${ROW_CLASS}`)]
        .map((el) => workflowAnchors(el)[0])
        .filter(Boolean)
        .map(workflowId)
    ).size;
    if (!loadedAll) count.textContent = 'loading…';
    else count.textContent = searching ? `${distinct.size}/${total}` : String(total);
  }

  async function onToggle(id) {
    const slug = repoSlug();
    if (!slug) return;
    favorites = await GhaStore.togglePin(slug, id);
    render();
  }

  async function onToggleCollapse(key) {
    collapsed = await GhaStore.setCollapsed(key, !collapsed[key]);
    applyFilter(document.querySelector(`.${WRAP_CLASS} .ghapin-filter`)?.value || '');
  }

  function render() {
    if (rendering) return;
    if (!repoSlug() || !onActionsPage()) return;

    rendering = true;
    observer?.disconnect();
    try {
      for (const stale of document.querySelectorAll(`.${HEADER_CLASS}`)) stale.remove();

      const model = findList();
      if (!model) return;

      for (const row of model.rows) decorate(row, row.el, onToggle);

      const groups = visibleGroups(groupRows(model.rows, { favorites }));
      for (const group of groups) {
        if (group.title) model.container.append(buildHeader(group, onToggleCollapse));
        for (const row of group.rows) {
          row.el.setAttribute(GROUP_ATTR, group.key);
          model.container.append(row.el);
        }
      }

      const wrap = document.querySelector(`.${WRAP_CLASS}`) || buildFilter(model);
      applyFilter(wrap.querySelector('.ghapin-filter').value);
    } finally {
      rendering = false;
      connect();
    }
  }

  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(render, 120);
  };

  function connect() {
    observer?.disconnect();
    observer = new MutationObserver((records) => {
      if (rendering) return;
      const external = records.some((record) =>
        [...record.addedNodes, ...record.removedNodes].some(
          (node) =>
            node.nodeType === 1 &&
            !node.classList?.contains(STAR_CLASS) &&
            !node.classList?.contains(HEADER_CLASS) &&
            !node.classList?.contains(WRAP_CLASS)
        )
      );
      if (external) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  async function boot() {
    const slug = repoSlug();
    if (!slug || !onActionsPage()) return;

    loadedAll = false;
    [favorites, collapsed] = await Promise.all([GhaStore.getPins(slug), GhaStore.getCollapsed()]);
    render();

    const model = findList();
    if (!model) return;

    // One load per page view, shared by every caller that arrives meanwhile.
    loading = loading || loadAllWorkflows(model.container);
    try {
      await loading;
    } finally {
      loading = null;
    }
    render();
  }

  GhaApi.storage.onChanged.addListener(async () => {
    const slug = repoSlug();
    if (!slug || !onActionsPage()) return;
    const next = await GhaStore.getPins(slug);
    if (next.join(' ') === favorites.join(' ')) return;
    favorites = next;
    render();
  });

  let lastUrl = location.href;
  function onNavigated() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    boot();
  }

  // Framework events first, because they fire immediately. The interval is the
  // backstop: GitHub renames these events from time to time, and a missed
  // event would otherwise leave the sidebar bare until a full reload.
  for (const event of ['turbo:load', 'turbo:render', 'turbo:frame-load', 'pjax:end', 'soft-nav:end']) {
    document.addEventListener(event, onNavigated);
  }
  window.addEventListener('popstate', onNavigated);
  setInterval(onNavigated, 500);

  // Watch from the start, not only after a render succeeds, so arriving on a
  // slow page still gets picked up once the sidebar appears.
  connect();
  boot();
})();
