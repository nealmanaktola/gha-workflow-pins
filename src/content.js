'use strict';

(() => {
  const STAR_CLASS = 'ghapin-star';
  const ROW_CLASS = 'ghapin-row';
  const WRAP_CLASS = 'ghapin-filter-wrap';
  const HEADER_CLASS = 'ghapin-header';
  const GROUP_ATTR = 'data-ghapin-group';
  const CACHED_ATTR = 'data-ghapin-cached';
  const WORKFLOW_PATH = /^\/[^/]+\/[^/]+\/actions\/workflows\/.+$/;
  const SHOW_MORE = '[data-target="nav-list-group.showMoreItem"]';
  const MAX_PAGES = 30;

  let observer = null;
  let rendering = false;
  let loading = null;
  let loadedAll = false;
  let favorites = [];
  let collapsed = {};
  let signature = '';
  let lastWrite = 0;

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

  async function fetchPage(src, page) {
    const url = new URL(src, location.origin);
    url.searchParams.set('page', String(page));
    try {
      const response = await fetch(url.toString(), {
        credentials: 'same-origin',
        headers: { Accept: 'text/html' },
      });
      if (!response.ok) return null;
      const doc = new DOMParser().parseFromString(`<ul>${await response.text()}</ul>`, 'text/html');
      for (const node of doc.querySelectorAll('script, style, link')) node.remove();
      return [...doc.querySelectorAll('li')].filter((li) => workflowAnchors(li).length);
    } catch {
      return null;
    }
  }

  // Fallback for when the extension cannot fetch the partial itself, which
  // happens in Firefox until the user grants access to github.com. Clicking
  // GitHub's own button makes the page do the request. The mutation observer
  // picks up the rows it adds.
  function clickThroughShowMore(more) {
    const button = more.querySelector('button') || more;
    if (typeof button.click !== 'function') return false;
    let clicks = 0;
    const timer = setInterval(() => {
      clicks += 1;
      const live = document.querySelector(SHOW_MORE);
      const target = live?.querySelector('button') || live;
      if (!target || clicks > MAX_PAGES || live.hidden) {
        clearInterval(timer);
        return;
      }
      target.click();
    }, 400);
    button.click();
    return true;
  }

  // GitHub paginates the sidebar and only renders the first page. Pull the rest
  // from the same partial endpoint its "Show more" button uses, so the filter
  // searches every workflow and favorites outside the first page still appear.
  //
  // Every page GitHub declares is fetched at once. Doing this one page at a
  // time cost a round trip per page, which is what made favorites take seconds
  // to fill in on a large repository.
  async function loadAllWorkflows(container) {
    const more = document.querySelector(SHOW_MORE);
    const src = more?.getAttribute('src');
    if (!more || !src) {
      loadedAll = true;
      return 0;
    }


    const current = Number(more.getAttribute('data-current-page') || '1');
    const declared = Number(more.getAttribute('data-total-pages') || '0');

    // One page past the declared end confirms the end in the same round trip.
    const first = [];
    for (let page = current + 1; page <= Math.max(declared, current) + 1; page += 1) first.push(page);
    const batches = await Promise.all(first.map((page) => fetchPage(src, page)));
    let failed = batches.some((batch) => batch === null);

    // data-total-pages can undercount. Walk on while pages keep coming back
    // full, because an empty page is the only dependable end marker.
    let next = first[first.length - 1] + 1;
    for (let step = 0; step < MAX_PAGES && batches[batches.length - 1]?.length; step += 1) {
      const page = await fetchPage(src, next);
      if (page === null) {
        failed = true;
        break;
      }
      if (!page.length) break;
      batches.push(page);
      next += 1;
    }

    const items = batches.filter(Boolean).flat();

    // Nothing came back. Let GitHub fetch its own pages instead: its button
    // runs in the page, so it needs no permission the extension might lack.
    if (!items.length && failed) {
      loadedAll = true;
      return clickThroughShowMore(more) ? 0 : null;
    }

    // Drop a cached favorite only once its real row is in hand. Clearing them
    // first meant a failed load emptied the favorites group, which took both
    // group headers with it.
    const incoming = new Set(items.map((item) => workflowId(workflowAnchors(item)[0])));
    for (const cached of container.querySelectorAll(`[${CACHED_ATTR}]`)) {
      const anchor = workflowAnchors(cached)[0];
      if (anchor && incoming.has(workflowId(anchor))) cached.remove();
    }

    const seen = new Set(workflowAnchors(container).map(workflowId));
    const fragment = document.createDocumentFragment();
    let added = 0;
    for (const item of items) {
      const id = workflowId(workflowAnchors(item)[0]);
      if (seen.has(id)) continue;
      seen.add(id);
      fragment.append(document.importNode(item, true));
      added += 1;
    }
    container.append(fragment);

    loadedAll = true;
    // Leave the button in place when the load failed, so the user still has
    // GitHub's own way to see the rest of the list.
    if (!failed) {
      more.setAttribute('hidden', 'hidden');
      more.style.display = 'none';
    }
    return failed ? null : added;
  }

  // A favorite drawn from cache, before the real list arrives. It carries the
  // same markup and a real href, so it looks and behaves like GitHub's own row.
  function buildCachedRow(slug, id, label) {
    const li = document.createElement('li');
    li.className = 'actions-workflow-list-item ActionListItem';
    li.setAttribute(CACHED_ATTR, '1');

    const link = document.createElement('a');
    link.className = 'ActionListContent';
    link.href = `/${slug}/actions/workflows/${id.split('/').map(encodeURIComponent).join('/')}`;

    const text = document.createElement('span');
    text.className = 'ActionListItem-label ActionListItem-label--truncate';
    text.textContent = label;

    link.append(text);
    li.append(link);
    return li;
  }

  // Favorites the sidebar has not rendered yet. GitHub only sends the first
  // page, so without this a favorite further down the list cannot appear until
  // every page has arrived.
  function paintCachedFavorites(container, slug, names) {
    const present = new Set(workflowAnchors(container).map(workflowId));
    const fragment = document.createDocumentFragment();
    let painted = 0;
    for (const id of favorites) {
      if (present.has(id) || !names[id]) continue;
      fragment.append(buildCachedRow(slug, id, names[id]));
      painted += 1;
    }
    if (painted) container.append(fragment);
    return painted;
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
    const container = findList()?.container;
    if (!container) return;
    const searching = Boolean(query.trim());

    // Only a group with a header can be rolled up, because the header is the
    // only way to roll it back down. Without this, a group collapsed on one
    // repository hid every row on the next one, which has no header of its
    // own, and left an empty sidebar with no way to recover.
    const foldable = new Set(
      [...container.querySelectorAll(`.${HEADER_CLASS}`)].map((h) => h.getAttribute(GROUP_ATTR))
    );

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
      const rolledUp = collapsed[key] && foldable.has(key);
      const hidden = !hit || (rolledUp && !searching);
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
    lastWrite = Date.now();
    favorites = await GhaStore.togglePin(slug, id);
    lastWrite = Date.now();
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
      const model = findList();
      if (!model) return;

      // Decide before touching anything. Clearing the old headers first would
      // strip them on every skipped render and never put them back.
      const next = `${favorites.join(',')}|${model.rows.map((row) => row.id).join(',')}`;
      if (next === signature && document.querySelector(`.${WRAP_CLASS}`)) return;

      for (const stale of document.querySelectorAll(`.${HEADER_CLASS}`)) stale.remove();
      for (const row of model.rows) decorate(row, row.el, onToggle);

      const groups = visibleGroups(groupRows(model.rows, { favorites }));
      const fragment = document.createDocumentFragment();
      for (const group of groups) {
        if (group.title) fragment.append(buildHeader(group, onToggleCollapse));
        for (const row of group.rows) {
          row.el.setAttribute(GROUP_ATTR, group.key);
          fragment.append(row.el);
        }
      }
      model.container.append(fragment);

      const wrap = document.querySelector(`.${WRAP_CLASS}`) || buildFilter(model);
      applyFilter(wrap.querySelector('.ghapin-filter').value);
      signature = `${favorites.join(',')}|${findList().rows.map((row) => row.id).join(',')}`;
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
    const list = findList()?.container;
    const scope = list?.parentElement || document.body;
    observer.observe(scope, { childList: true, subtree: true });
  }

  // Remember what each workflow is called, so the next visit can draw the
  // favorites group before the network answers.
  async function cacheNames(slug, model) {
    const names = {};
    for (const row of model.rows) {
      if (row.el.hasAttribute(CACHED_ATTR) || !row.label) continue;
      names[row.id] = row.label;
    }
    if (Object.keys(names).length) await GhaStore.rememberNames(slug, names);
  }

  // Once the full list is in, a favorite that is still missing no longer
  // exists. Dropping one is not something the user asked for, so every doubt
  // resolves in favour of keeping it:
  //
  //   - a failed fetch looks exactly like a short list, so complete must hold
  //   - an empty sidebar means the page did not render, not that every
  //     workflow was deleted
  //   - losing every favorite at once is a broken read, not a real repository
  //
  // What is dropped is kept, so the options page can put it back.
  async function reconcileFavorites(slug, model, complete) {
    if (!complete || !favorites.length || !model.rows.length) return;

    const present = new Set(model.rows.map((row) => row.id));
    const gone = favorites.filter((id) => !present.has(id));
    if (!gone.length) return;
    if (gone.length === favorites.length) return;

    const names = await GhaStore.getNames(slug);
    const entries = {};
    for (const id of gone) entries[id] = { label: names[id] || id, at: Date.now() };
    await GhaStore.rememberRemoved(slug, entries);

    favorites = await GhaStore.setPins(slug, favorites.filter((id) => present.has(id)));
    await GhaStore.forgetNames(slug, gone);
    render();
  }

  async function boot() {
    const slug = repoSlug();
    if (!slug || !onActionsPage()) return;

    loadedAll = false;
    signature = '';
    const [pins, collapsedState, names] = await Promise.all([
      GhaStore.getPins(slug),
      GhaStore.getCollapsed(),
      GhaStore.getNames(slug),
    ]);
    favorites = pins;
    collapsed = collapsedState;

    const early = findList();
    if (early) paintCachedFavorites(early.container, slug, names);
    render();

    const model = findList();
    if (!model) return;

    // One load per page view, shared by every caller that arrives meanwhile.
    loading = loading || loadAllWorkflows(model.container);
    let complete = false;
    try {
      complete = (await loading) !== null;
    } finally {
      loading = null;
    }
    render();

    const loaded = findList();
    if (!loaded) return;
    await cacheNames(slug, loaded);
    await reconcileFavorites(slug, loaded, complete);
  }

  // Another tab or another device changed the favorites. Take the value the
  // event carries: reading storage back can answer from a different area than
  // the write went to, and an empty answer would silently clear the sidebar.
  //
  // An echo of this tab's own write is ignored. onToggle already holds the
  // authoritative list, and letting the echo overwrite it made a new favorite,
  // and its header, appear and then vanish a moment later.
  GhaApi.storage.onChanged.addListener((changes) => {
    const slug = repoSlug();
    if (!slug || !onActionsPage() || !changes) return;
    const change = changes[`pins:${slug}`];
    if (!change) return;
    if (Date.now() - lastWrite < 2000) return;

    const next = Array.isArray(change.newValue) ? change.newValue : [];
    if (next.join(',') === favorites.join(',')) return;
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
