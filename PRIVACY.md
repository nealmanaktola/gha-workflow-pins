# Privacy policy

Last updated: 14 September 2026

## The short version

This extension collects nothing, sends nothing, and talks to no server of ours. There is no
analytics, no telemetry, no tracking, and no account.

## What it stores

It stores three things, all of them created by you or read from the page you are already looking
at:

| What | Where | Why |
| ---- | ----- | --- |
| Which workflows you favorited, per repository | Your browser's extension storage | To show them at the top of the sidebar |
| The display name of workflows it has seen | Your browser, locally | To draw your favorites before the page finishes loading |
| Which sidebar groups you rolled up | Your browser, locally | To keep the sidebar the way you left it |

If you turn sync on, your favorites travel through **your browser's own sync** — Firefox Sync or
Chrome Sync — between your own devices. That is a channel between you and your browser vendor. The
author of this extension never sees it and operates no server that could.

Everything else stays on the machine it was created on.

## What it sends

One kind of request, to `github.com` only: the same workflow-list request GitHub's own "Show more
workflows" button makes, so the sidebar can show every workflow rather than the first page. It goes
to GitHub, carries your existing GitHub session exactly as the page itself does, and goes nowhere
else.

No data is sent to the author or to any third party. There is no other network activity.

## Permissions

| Permission | What it is for |
| ---------- | -------------- |
| `storage` | Keeping your favorites and preferences |
| `activeTab` | Letting the toolbar popup know which repository you are looking at |
| `https://github.com/*` (optional) | Fetching the rest of the workflow list. Optional: decline it and the extension falls back to clicking GitHub's own button |

The extension runs only on `github.com`, and only does anything on a repository's Actions page.

## Deleting your data

Open the extension's options page and use **Clear all pins**, or remove the extension. Uninstalling
removes everything stored locally. If you used sync, your browser removes the synced copy on its
own schedule.

## Contact

Open an issue: https://github.com/nealmanaktola/gha-workflow-pins/issues
