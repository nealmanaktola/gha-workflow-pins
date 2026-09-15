# Store listing copy

Copy for both stores.

## Name

**Shortlist for GitHub Actions.** The brand is the one word, *Shortlist*.

The earlier name, `GitHub Actions: Pins & Filter`, led with someone else's trademark and read like
a GitHub product. Chrome's policy forbids representing that a product is "authorized by, endorsed
by, or produced by another company", and third-party-name-heavy listings are a common rejection.
Google's own branding guidance endorses the `<Name> for <Product>` pattern, and it is Mozilla's
stated convention too.

Keep "GitHub" to **once** in the name, once in the short description, and sparingly in the long
one. Repeating it across all three reads as keyword stuffing and is rejected on its own.

## Prior art

[GitHub Actions Workflow Filter](https://chromewebstore.google.com/detail/github-actions-workflow-f/mcndebekenfmejfkhooeiejoekjcehlk)
already ships a similar idea on the Chrome Web Store. Worth knowing two things. It proves Chrome
accepted a name that does lead with the trademark, so that is a risk rather than a certainty. And
the listing has to read as its own thing, not as a near-duplicate.

## Short description (132 characters max)

> Favorite the workflows you actually use, and filter the whole list. Private to you, no five-pin
> limit, no repository access needed.

131 characters.

## Single purpose

> Adds a private, per-user list of favorite workflows and a filter to the GitHub Actions sidebar.

## Detailed description

> The Actions sidebar shows ten workflows and hides the rest behind "Show more". If your repository
> has ninety, the one you check every day is somewhere below the fold.
>
> This adds two things.
>
> **Favorites.** Star any workflow and it moves to a "My favorites" group at the top. Your stars
> are yours alone: nobody else sees them, they need no write access to the repository, and there is
> no limit on how many you keep. The built-in pin is repository-wide, capped at five, and needs
> write access. This is the other thing.
>
> **A filter that searches everything.** Type to narrow the list. Terms match in any order, against
> both the workflow name and its filename, so "e2e call" finds "Test / Branch / E2E-Simple-Call".
> It searches every workflow, not just the first page.
>
> Both groups roll up if you want them out of the way, and the sidebar stays how you left it.
>
> Favorites can follow you between machines through your browser's own sync, or stay on one
> machine. Your choice, in the options page.
>
> No account, no analytics, no telemetry, no server. It talks to github.com and nothing else.
> Open source: https://github.com/nealmanaktola/shortlist-gha

## Category

Developer Tools

## Permission justifications

| Permission | Justification |
| ---------- | ------------- |
| `storage` | Stores which workflows the user favorited, the display names needed to render them before the page loads, and which sidebar groups they rolled up. Local to the browser, or the user's own browser sync if they enable it. |
| `activeTab` | The toolbar popup lists favorites for the repository the user is currently viewing, so it needs the active tab's URL at the moment the user opens it. |
| `https://github.com/*` (optional host) | Fetches the remaining pages of the workflow list from GitHub's own `workflows_partial` endpoint, the same request its "Show more workflows" button makes. Optional: if the user declines, the extension falls back to clicking that button instead. |
| Content script on `https://github.com/*` | GitHub navigates with Turbo, so a narrower match never injects when the user reaches Actions by clicking the tab from another page. The script returns immediately on every page that is not a repository Actions page. |

## Data usage disclosures (Chrome)

Answer **no** to every collection category. Then tick all three certifications:

- Not being sold to third parties, outside of approved use cases
- Not being used or transferred for purposes unrelated to the item's single purpose
- Not being used or transferred to determine creditworthiness or for lending purposes

Privacy policy URL: the raw or Pages link to `PRIVACY.md` in this repository.

## Assets

| Asset | Size | File |
| ----- | ---- | ---- |
| Screenshot | 1280×800 | `store/screenshot-1280x800.png` |
| Small promo tile | 440×280 | `store/promo-440x280.png` |
| Icon | 128×128 | `icons/icon-128.png` |

Regenerate with `npm run screenshot`. A 1400×560 marquee tile is optional and not yet made.

## Firefox (AMO) submission

The first submission of a new add-on goes through the web form, because listing text, screenshots
and categories cannot be set through the API. Every version after that can use
`npm run submit:firefox`.

1. Run the manual Firefox pass in `CONTRIBUTING.md`. Nothing automated covers Firefox.
2. `npm run package` — produces `dist/shortlist-gha-<version>.zip`.
3. Go to https://addons.mozilla.org/developers/addon/submit/ and choose **On this site**.
4. Upload the zip. It should validate with no errors.
5. Fill the listing from the fields below.
6. Submit. Review usually takes a few days; AMO emails the outcome.

### AMO listing fields

| Field | Value |
| ----- | ----- |
| Name | Shortlist for GitHub Actions |
| Add-on URL slug | `shortlist-for-github-actions` |
| Summary | The short description above, 250 characters max on AMO |
| Description | The detailed description above |
| Categories | Other (AMO has no Developer Tools category for extensions) |
| Tags | github, actions, workflow, ci, productivity |
| Support email | your contact address |
| Support site | https://github.com/nealmanaktola/shortlist-gha/issues |
| Homepage | https://github.com/nealmanaktola/shortlist-gha |
| Licence | MIT |
| Privacy policy | Paste the text of `PRIVACY.md` |
| Screenshots | `store/screenshot-1280x800.png`, plus `docs/screenshot-filter.png` and `docs/screenshot-collapsed.png` |

AMO asks whether the add-on needs its source code submitted. Answer **no**: nothing here is
minified, obfuscated or generated, so the uploaded package is already the readable source.

### Credentials, for later versions

Get an API key and secret from https://addons.mozilla.org/developers/addon/api/key/ , then keep
them in the environment rather than in a file or in shell history:

```bash
export AMO_API_KEY='user:12345678:123'
export AMO_API_SECRET='...'
npm run submit:firefox
```

Treat that secret like a password. It can publish under your name.

## Submission checklist

- [x] Name decided and applied in `manifest.json`, `package.json` and here
- [x] `browser_specific_settings.gecko.id` final: `shortlist@nealmanaktola.github.io` — **changing it after release empties every user's favorites**
- [ ] Version bumped, `CHANGELOG.md` updated
- [ ] `npm test` and `npm run verify:sidebar` both clean
- [ ] Manual Firefox pass (see `CONTRIBUTING.md`) — no automation covers Firefox
- [ ] `npm run package` and both zips checked
- [ ] Privacy policy published at a public URL
- [ ] Chrome: developer account registered (one-time 5 USD fee)
- [ ] Firefox: submitted to AMO for signing
