# Contributing to Unsay

Thanks for helping. Unsay deletes people's data, so the bar for changes that touch deleting is high,
and everything else is welcome.

What helps most:

- **Compatibility reports:** try Unsay on your account and say how it went, with the panel's
  Diagnostics; see [docs/beta-testing.md](docs/beta-testing.md).
- **Bug reports** through the issue form, with the panel's Diagnostics and the "Technical details"
  from its error screen when there is one. Never paste chat titles, contents or ids.
- **Fixes when claude.ai changes its internal API.** It is undocumented and changes without notice;
  see [below](#when-claudeai-changes-its-api).
- **Ideas** through the idea form. For anything bigger than a small fix, open an issue first so we
  can agree on the approach before you spend time on it.

A bug that could delete something the user didn't select, or let data leave the browser, is a
security issue: report it privately as described in [SECURITY.md](SECURITY.md).

## Setup

Node 24 and pnpm 12 (older versions refuse to install; a different pnpm switches to the version
`packageManager` pins on its own; settings in `pnpm-workspace.yaml`).

```sh
pnpm install --frozen-lockfile   # also generates .wxt/ types and installs the git hooks
pnpm dev                         # watch build into .output/chrome-mv3-dev
```

Load `.output/chrome-mv3-dev` in `chrome://extensions` (Developer mode → Load unpacked) and open
claude.ai. Try anything that deletes on throwaway chats only.

Before you push, the same checks as CI: `pnpm check`, `pnpm lint`, `pnpm dep:check`,
`pnpm test` and `pnpm test:e2e` (the browser tests; it builds first, and needs
`pnpm exec playwright install chromium` once). The pre-commit hook runs prettier, the type check and
eslint.

## Ground rules

These are why people can trust the extension. Each one has tests; a change that breaks one won't
be merged.

- **Nothing is deleted without the review and the typed confirmation.** Every path that deletes
  goes through the review list and the `delete N` confirmation.
- **Only what the user selected, and only if it is still there.** An id is only sent to a delete
  endpoint if it is in the user's selection and in the list re-read right before deleting,
  unchanged since the review.
- **Starred chats are left alone** unless the user opts in.
- **Every response from claude.ai is validated** by the zod schemas in `src/lib/core`. On a shape
  we don't recognise, stop with a clear error and delete nothing.
- **Diagnostics hold no values from claude.ai.** They describe its answers by field names, kinds
  of values and counts; never a title, an id or a name.
- **Tests never touch the real claude.ai.** They run against the in-memory fake in
  `src/lib/core/testing`; the browser tests route every claude.ai request to it and block all
  other hosts.
- **No new origins, no new permissions, no analytics, no remote code.** A new permission needs the
  README permission table and the store justification in `docs/store-listing.md` updated in the
  same pull request.
- **`src/lib/core` stays plain TypeScript:** no Svelte, WXT or extension APIs. ESLint and
  `pnpm dep:check` enforce it.
- **The panel is a guest on claude.ai.** It lives in a shadow root and never changes claude.ai's
  page, styles or storage.

## Commits and pull requests

- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`,
  `docs:`, …); commitlint checks them. The changelog and the version number are built from them,
  so the type matters: `feat` is a new feature, `fix` a bug fix.
- One topic per pull request. `main` only takes rebase merges, so keep the commits meaningful
  rather than squashing everything into one.
- Fill in the pull request checklist. CI has to pass before anything is merged.

## Releases

Releases come from [release-please](https://github.com/googleapis/release-please), which reads the
commit messages:

- It keeps a release pull request open that bumps the version in `package.json` and adds the new
  entries to `CHANGELOG.md`. Merging that pull request is the decision to release.
- The [release workflow](.github/workflows/release.yml) then runs the full CI on the release
  commit, packs the zip, attests it, attaches it to the draft release with `SHA256SUMS` and
  publishes it. Published releases are immutable.
- Once the store item exists, the release workflow then hands the zip to the
  [store workflow](.github/workflows/store.yml), which uploads it to the Chrome Web Store and
  submits it for review after the maintainer approves the run. See
  [docs/store-publishing.md](docs/store-publishing.md).
- Only the release app creates `v*` tags; a tag ruleset blocks everyone else from creating, moving
  or deleting them. Don't tag by hand, and don't edit `CHANGELOG.md` by hand.
- While the version is `0.x`, `feat` bumps the minor version, `fix` the patch, and a breaking change
  also only the minor. `1.0.0` comes with the Chrome Web Store launch, through a
  `Release-As: 1.0.0` footer in a commit.
- If publishing fails, use "Re-run failed jobs": the draft release and its tag stay in place until
  it goes through.

## When claude.ai changes its API

The extension stops instead of guessing, and the error screen's "Technical details" name the
request and the field that changed; its Diagnostics show the new shape. A fix usually touches:

1. `src/lib/core/schemas.ts`: accept the new shape. Stay strict on anything a deletion decision
   depends on (ids, timestamps, the starred flag, project membership).
2. `src/lib/core/testing/fixtures.ts`: a builder for the new shape, keeping the old one if
   claude.ai might still send it.
3. Tests for both shapes.
4. `docs/api-notes.md`: what changed and when it was observed.

## License

Unsay is licensed under the [GPL-3.0-or-later](LICENSE). By contributing, you agree that your
contribution is licensed under the same terms.

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
