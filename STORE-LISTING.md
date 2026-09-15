# Store listing copy

Working draft for both stores. **The name is not settled — see the warning below.**

## ⚠️ Decide the name before submitting

The current manifest name, `GitHub Actions: Pins & Filter`, leads with someone else's trademark and
reads like a GitHub product. Chrome's policy forbids representing that a product is "authorized by,
endorsed by, or produced by another company", and listings heavy with third-party product names are
a common rejection. Mozilla's own convention is `<Add-on name> for <Product>`.

Suggested: **Workflow Favorites for GitHub Actions**. Your name first, the product second,
mentioned once per listing field. Whatever you pick, change it in `manifest.json` and here together.

Mention "GitHub" **once** in the name, once in the short description, and sparingly in the long
description. Repetition across all three reads as keyword stuffing and gets rejected on its own.

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
> Open source: https://github.com/nealmanaktola/gha-workflow-pins

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

## Submission checklist

- [ ] Name decided and changed in `manifest.json`, `package.json` and here
- [ ] `browser_specific_settings.gecko.id` final — **changing it after release empties every user's favorites**
- [ ] Version bumped, `CHANGELOG.md` updated
- [ ] `npm test` and `npm run verify:sidebar` both clean
- [ ] Manual Firefox pass (see `CONTRIBUTING.md`) — no automation covers Firefox
- [ ] `npm run package` and both zips checked
- [ ] Privacy policy published at a public URL
- [ ] Chrome: developer account registered (one-time 5 USD fee)
- [ ] Firefox: submitted to AMO for signing
