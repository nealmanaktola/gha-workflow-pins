// Replays loadAllWorkflows()'s loop against the live endpoint, to confirm the
// termination rule finds every workflow.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0';
const MAX_PAGES = 30;

async function crawl(repo) {
  const seen = new Set();
  let page = 1;
  const perPage = [];
  for (let step = 0; step < MAX_PAGES; step += 1) {
    page += 1;
    const url = `https://github.com/${repo}/actions/workflows_partial?query=&page=${page}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
    if (!res.ok) { perPage.push(`p${page}:HTTP${res.status}`); break; }
    const html = await res.text();
    const ids = [...html.matchAll(/\/actions\/workflows\/([^"?#]+)"/g)].map((m) => m[1]);
    const unique = [...new Set(ids)];
    perPage.push(`p${page}:${unique.length}`);
    if (!unique.length) break;           // the only dependable end marker
    for (const id of unique) seen.add(id);
  }
  return { repo, total: seen.size, perPage: perPage.join(' ') };
}

for (const repo of ['microsoft/vscode', 'home-assistant/core']) {
  const r = await crawl(repo);
  console.log(`${r.repo.padEnd(22)} extra workflows found: ${String(r.total).padStart(3)}   pages: ${r.perPage}`);
}
