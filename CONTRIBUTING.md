# Contributing to Unsay

Thanks for helping. Unsay deletes people's data, so the bar for changes that touch deleting is high,
and everything else is welcome.

What helps most:

- **Bug reports** through the issue form, with the "Technical details" from the panel's error
  screen when there is one. Never paste chat titles, contents or ids.
- **Fixes when claude.ai changes its internal API.** It is undocumented and changes without notice;
  see [below](#when-claudeai-changes-its-api).
- **Ideas** through the idea form. For anything bigger than a small fix, open an issue first so we
  can agree on the approach before you spend time on it.

A bug that could delete something the user didn't select, or let data leave the browser, is a
security issue: report it privately as described in [SECURITY.md](SECURITY.md).

## Setup

Node 24 and npm ≥ 11.10 (older versions refuse to install; see `.npmrc`).

```sh
npm ci           # also generates .wxt/ types and installs the git hooks
npm run dev      # watch build into .output/chrome-mv3-dev
```

Load `.output/chrome-mv3-dev` in `chrome://extensions` (Developer mode → Load unpacked) and open
claude.ai. Try anything that deletes on throwaway chats only.

Before you push, the same checks as CI: `npm run check`, `npm run lint`, `npm run dep:check`,
`npm run test` and `npm run build`. The pre-commit hook runs prettier, the type check and eslint.

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
- **Tests never touch the real claude.ai.** They run against the in-memory fake in
  `src/lib/core/testing`.
- **No new origins, no new permissions, no analytics, no remote code.** A new permission needs the
  README permission table and the store justification updated in the same pull request.
- **`src/lib/core` stays plain TypeScript:** no Svelte, WXT or extension APIs. ESLint and
  `npm run dep:check` enforce it.
- **The panel is a guest on claude.ai.** It lives in a shadow root and never changes claude.ai's
  page, styles or storage.

## Commits and pull requests

- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`,
  `docs:`, …); commitlint checks them. The changelog and the version number are built from them,
  so the type matters: `feat` is a new feature, `fix` a bug fix.
- One topic per pull request. `main` only takes rebase merges, so keep the commits meaningful
  rather than squashing everything into one.
- Fill in the pull request checklist. CI has to pass before anything is merged.

## When claude.ai changes its API

The extension stops instead of guessing, and the error screen's "Technical details" name the
request and the field that changed. A fix usually touches:

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
