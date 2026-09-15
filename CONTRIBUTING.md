# Contributing

## Setup

```bash
npm install                         # only needed for the browser checks
npx playwright install chromium     # see the warning below
```

## Checks

```bash
npm test                # unit tests, no dependencies, uses node:test
npm run verify:sidebar  # 22 DOM checks in a real browser, exits non-zero on failure
npm run lint:firefox    # web-ext lint
npm run verify:pagination   # walks the live partial endpoint page by page
npm run screenshot          # retakes docs/ and store/ images
```

## Use Playwright's Chromium, not Google Chrome

Chrome 137 and later ignore `--load-extension`, and Chrome 153 ignores the flag that used to
re-enable it. Point the checks at the installed Chrome and the extension never loads, every check
passes against an empty page, and you will believe the code is fine when it is not. This has cost
real debugging time. Use the Chromium that `npx playwright install chromium` provides.

## Writing a browser check

Make it fail against the bug it describes, then fix the bug, then watch it pass. Both directions,
every time.

This is not a formality. One early version of the header check poked `document.body` to force a
re-render, but the mutation observer watches only the sidebar, so no render ever happened and all
twelve checks passed against a build with a real bug in it. A check that never triggers the code
path it is testing is worse than no check, because it is believed.

## Firefox is not covered by automation

Every browser check runs in Chromium. Playwright cannot load extensions into Firefox, so nothing
here proves Firefox works, and several bugs have been Firefox-only. Before a release, load the
extension by hand from `about:debugging` and walk through:

- [ ] Reach Actions by clicking the tab from a repository page. The filter box appears without a reload.
- [ ] Star a workflow. The **My favorites** header appears and is still there ten seconds later.
- [ ] Reload. Favorites appear immediately, before the full list finishes.
- [ ] Filter. Both headers show their own counts.
- [ ] Roll up a group, reload, confirm it is still rolled up.
- [ ] Open a workflow run page. Nothing is injected.
- [ ] Options page offers to grant access to github.com, and the grant works.

## Style

Simplified technical English in comments and commit messages. Short sentences, active voice, one
idea per sentence. A comment explains why, not what. If a comment labels a block, that block wants
to be a function.

Logic goes in `store.js` or `match.js` where unit tests can reach it. `content.js` holds DOM work,
which only the browser checks can cover.
