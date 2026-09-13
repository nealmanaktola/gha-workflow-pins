# GitHub Actions: Pins & Filter

A Firefox and Chrome extension. It adds three things to the GitHub Actions sidebar:

1. **Private favorites.** Star any workflow to lift it into a **My favorites** group at the top of
   the sidebar. The star is yours alone. GitHub's own pin is repository-wide, needs write access,
   and caps you at 5. This one is per-user, needs no permissions on the repository, and has no limit.
2. **Two collapsible groups.** **My favorites**, then **All workflows**, each under a header you
   can click to roll up. The headers reuse GitHub's own section-divider styling. With nothing
   favorited there is one flat list and no headers at all, because a lone header labels nothing.
3. **A live filter over every workflow.** Type to narrow the list. Terms match in any order, against
   both the workflow name and its filename.

<p align="center">
  <img src="docs/screenshot-sidebar.png" alt="The Actions sidebar with a filter box, a My favorites group holding three starred workflows, and an All workflows group below" width="292">
</p>

GitHub paginates the sidebar and renders only the first page, so a plain filter would search ten
workflows out of a hundred. On load this extension pulls the remaining pages from the same
`/{owner}/{repo}/actions/workflows_partial` endpoint that GitHub's own "Show more workflows" button
uses, then hides that button. The filter therefore searches everything.

## Install for development

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on**.
3. Pick `manifest.json` in this directory.

A temporary add-on is removed when Firefox restarts. For a permanent install, sign the zip from
`npm run package` at [addons.mozilla.org](https://addons.mozilla.org/developers/) and install the
signed `.xpi`.

### Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and pick this directory.

## Use

- Open any repository's **Actions** tab.
- Hover a workflow. Click the star at the right of the row.
- Favorites move to the **My favorites** group, in the order you starred them.
- Click a group header to roll that group up. The choice sticks, per browser.
- Type in **Filter workflows…** to narrow the list. `Escape` clears it. The counter reads
  `12/87` while filtering, and `87` when not. Each header carries its own match count.
- While you are filtering, a rolled-up group opens on its own. A search that hides its results
  is not a search.

<table>
  <tr>
    <td width="50%" valign="top" align="center">
      <img src="docs/screenshot-filter.png" alt="The sidebar filtered by the word build, showing three matches out of twenty-four, one under My favorites and two under All workflows" width="300">
      <br><em>Filtering. The box counts <code>3/24</code>, and each header counts its own matches.</em>
    </td>
    <td width="50%" valign="top" align="center">
      <img src="docs/screenshot-collapsed.png" alt="The sidebar with the All workflows group rolled up, leaving only the three favorites visible" width="300">
      <br><em>All workflows rolled up, leaving the three favorites.</em>
    </td>
  </tr>
</table>
- Click the toolbar icon for the current repository's pins.
- **Manage** in that popup opens the options page: sync on or off, export, import, clear.

## Where pins live

Pins default to `storage.sync`, so they follow your browser profile across machines through Firefox
Sync or Chrome Sync. Turn sync off in the options page to keep them on one machine. Switching moves
the pins you already have.

If the sync area ever rejects a write, the pin goes to local storage instead and is still read back.
A sync outage never loses a pin.

Pins are keyed by `owner/repo` and store the workflow filename, for example
`pins:acme/widgets -> ["ci.yaml", "e2e-simple-call.yaml"]`.

## Permissions

- `storage` — to keep your favorites.
- `activeTab` — so the popup can tell which repository you are looking at.
- `https://github.com/*` — so the content script can read the remaining pages of the workflow list
  from GitHub's own partial endpoint.

There is no background script. The extension talks to nothing but github.com and sends nothing
anywhere.

The content script matches all of `https://github.com/*` rather than the Actions URL alone. GitHub
navigates with Turbo, so a narrower match never injects when you reach Actions by clicking the tab
from another page: the document never reloads. On every page that is not an Actions sidebar the
script returns immediately and touches nothing.

## Develop

```bash
npm test              # unit tests, no dependencies, uses node:test
npm run icons         # redraw icons/*.png with the standard library
npm run package       # build dist/*.zip for both stores
npm run lint:firefox  # web-ext lint, downloads web-ext on demand
npm run verify:pagination   # walk the live partial endpoint, page by page
npm run screenshot          # drive a real browser, retake docs/*.png
```

`npm run screenshot` needs Playwright's own Chromium:

```bash
npm i -D playwright && npx playwright install chromium
```

Use that build, not the installed Google Chrome. Chrome 137 and later ignore `--load-extension`,
so an extension never loads there and every check silently reports nothing.

### Layout

| File             | Role                                                              |
| ---------------- | ----------------------------------------------------------------- |
| `src/api.js`     | Picks `browser` or `chrome`, whichever the browser provides.       |
| `src/store.js`   | Pin storage. Takes the browser API as an argument, so it is testable. |
| `src/match.js`   | Filter matching and pin ordering. Pure functions.                  |
| `src/content.js` | The sidebar DOM work: stars, ordering, filter box.                 |
| `src/popup.*`    | Toolbar popup for the current repository.                          |
| `src/options.*`  | Sync toggle, export, import, clear, full pin list.                 |

`store.js` and `match.js` hold the logic and have unit tests. `content.js` holds the DOM work and
has none, because it needs a real browser.

### How it survives GitHub redesigns

`content.js` never matches on GitHub's CSS class names, which change often. It finds workflow links
by `href`, then treats whichever element holds the most of them as the sidebar list. If GitHub
changes the markup, revisit these three functions in order:

| Function             | Depends on                                                                  |
| -------------------- | --------------------------------------------------------------------------- |
| `findList()`         | Nothing but `href`. Should outlast most redesigns.                            |
| `loadAllWorkflows()` | The `src` and `data-current-page` attributes on GitHub's show-more element.   |
| `placeStar()`        | The class names GitHub gives a row's trailing badge, to avoid drawing over it. |

Run `npm run verify:pagination` to check `loadAllWorkflows()`'s page walk against the live
endpoint. It reports how many workflows each page returns and where the walk stops.

### What this extension does not touch

GitHub's own repository-wide pins are left exactly as GitHub renders them. The extension neither
groups them nor changes them. They are someone else's choice and can change at any time, so the
only list it manages is the one you curate. Where GitHub draws its own badge at the right of a
row, `placeStar()` steps the star inwards so the two never overlap.
