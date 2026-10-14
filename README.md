<img src="brand/icon.svg" width="72" height="72" alt="">

# Unsay

[![CI](https://github.com/theescodes/unsay/actions/workflows/ci.yml/badge.svg)](https://github.com/theescodes/unsay/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/theescodes/unsay/badge)](https://scorecard.dev/viewer/?uri=github.com/theescodes/unsay)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue)](LICENSE)

Bulk-delete your claude.ai chats, with filters and a review step. Open source, runs only on
claude.ai, sends nothing anywhere else.

> **Status: early development.** Not in the Chrome Web Store yet. The panel works end to end and
> has deleted real chats in testing, but it is young: if you try it, try it on throwaway chats
> first. Follow the repo for the first release.
>
> Not affiliated with or endorsed by Anthropic. "Claude" is a trademark of Anthropic.

## What it does

claude.ai can delete several chats at once, but its "Select all" only covers the chats currently
loaded in the list, and there are no filters. Unsay adds a panel on claude.ai that:

- loads your **whole** chat list, not just the rows on screen;
- filters by age, title, project, and leaves starred chats alone by default;
- shows you exactly what will go, lets you untick anything, and asks you to type the count to
  confirm;
- deletes in small batches, can be cancelled, then checks that every chat is really gone;
- gives you a CSV receipt of what was deleted.

## Why another one

The extensions in the store that do this are closed source, and some lock bulk delete behind a
paid tier. A tool that deletes your data should be one you can read. This one is GPL-3.0, ships
unminified, and every release will be built in public CI from a tagged commit, with a build
attestation, so you can check that the store package matches the source.

## Privacy

- Runs only on `https://claude.ai/*`.
- Talks only to claude.ai, with your existing session, the same way the claude.ai web app does.
- No analytics, no tracking, no remote code, no servers of its own. Your chat titles never leave
  your browser.

## Permissions

| Permission                              | Why                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| Content script on `https://claude.ai/*` | Shows the panel and calls claude.ai's own API with your session.                      |
| `web_accessible_resources` (panel CSS)  | WXT loads the panel's stylesheet into its shadow root; the URL is per-session random. |

That is the whole list. Any new permission has to be added to this table and justified in the
pull request that adds it.

## Install from source

```sh
npm ci
npm run build
```

Then open `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and select
`.output/chrome-mv3`. Open claude.ai and click the toolbar icon.

## Development

Node 24 and npm ≥ 11.10 (installs refuse to run on anything older; see `.npmrc`).

```sh
npm ci           # also generates .wxt/ types and installs the git hooks
npm run dev      # watch build into .output/chrome-mv3-dev — load that folder unpacked
```

| Command             | What it does                                                          |
| ------------------- | --------------------------------------------------------------------- |
| `npm run check`     | `wxt prepare` + svelte-check (types)                                  |
| `npm run lint`      | prettier --check and eslint, both always run                          |
| `npm run dep:check` | dependency-cruiser module boundaries                                  |
| `npm run test`      | Vitest                                                                |
| `npm run build`     | production build into `.output/chrome-mv3`                            |
| `npm run zip`       | store-ready zip                                                       |
| `npm run format`    | prettier --write                                                      |
| `npm run icons`     | renders `public/icon/*.png` and the social preview from `brand/*.svg` |

Commits follow Conventional Commits (commitlint), and the pre-commit hook runs prettier,
svelte-check and eslint. `main` takes rebase merges only.

## Architecture in 30 seconds

- `src/entrypoints/background.ts` — a toolbar click toggles the panel in the current tab, or
  takes the tab to claude.ai first.
- `src/entrypoints/claude.content/` — the content script on claude.ai: mounts the Svelte panel
  in a shadow root, so claude.ai's styles and ours never meet.
- `src/lib/core/` — plain TypeScript that decides what gets deleted: API client, filters,
  deleter. No Svelte, no extension APIs (enforced by ESLint and dependency-cruiser), so it is
  tested in Node against a fake claude.ai.
- `src/lib/ui/` — the Svelte 5 panel.

## Contributing

Bug reports, fixes and ideas are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). Everyone taking
part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Found a way this could delete something the user didn't pick, or send data anywhere? Please
report it privately; see [SECURITY.md](SECURITY.md).

## License

[GPL-3.0-or-later](LICENSE). Forks and modified versions must stay open source too.
