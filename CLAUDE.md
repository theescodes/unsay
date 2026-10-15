# unsay

"Unsay": an open-source (GPL-3.0) Chrome MV3 extension that bulk-deletes claude.ai
chats through claude.ai's internal web API, with filters and safe defaults. WXT + Svelte 5 +
TypeScript + Tailwind 4. No backend. See README.md for the architecture overview.

This is a public repository: never name the maintainer's other (private) projects in files,
commits, pull requests or issues. Notes about them belong in the untracked `CLAUDE.local.md`.

## Ground rules for this extension

- **It deletes user data.** Every path that deletes must go through the review list and the typed
  confirmation. Starred chats are excluded unless the user opts in. Never delete an id that is not
  in both the fresh list and the user's selection. Each of these invariants has a test; keep it.
- **claude.ai's API is undocumented.** Every response goes through the zod schemas in
  `src/lib/core`. On an unknown shape, stop with a clear error and delete nothing.
- **Diagnostics hold no values from claude.ai.** `src/lib/core/diagnostics.ts` keeps field names,
  kinds of values and counts; no title, id or name may reach the report. Tests check it.
- **Tests never touch the real claude.ai.** Unit tests use the in-memory fake; e2e routes
  `https://claude.ai/**` to it.
- **No new origins, no new permissions** without updating the README permission table and the
  store justification in the same PR. No analytics, no remote code.
- **`src/lib/core` stays framework-free:** no Svelte, WXT, bits-ui or extension APIs, fetch is
  injected. Enforced by ESLint (`no-restricted-imports`) and dependency-cruiser (`npm run dep:check`).
- **The panel lives in a shadow root on someone else's page.** Tokens hang off `:host`, never
  `:root`; don't touch claude.ai's DOM, body styles or storage. No bits-ui Dialog/AlertDialog
  (they portal to `document.body` and lock its scroll); the panel is a native `<dialog>`.
- Imports from WXT are explicit (`#imports`); auto-imports are off.

## Conventions

- All authoring language — identifiers, comments, commits, docs, PRs — is **English**.
- Svelte 5 runes only (`$state`, `$derived`, `$effect`, `$props`); no stores for local state.
- No loose files at the `src/lib/` root; every module lives in a purposeful folder.
- Check primitives before hand-rolling: an existing `src/lib/ui` component first, then bits-ui
  (use the bits-ui skill). Colours only through the theme tokens in `style.css`, never raw
  Tailwind palette names.
- Icons one per import: `@lucide/svelte/icons/<name>` (the barrel is banned by ESLint).
- Comments explain _why_, not what.
- No emojis in code, commits, comments or UI strings unless explicitly asked.

## Dependencies

- Exact versions only (`save-exact`), installs gated by `min-release-age=3` (npm ≥ 11.10,
  enforced through `engines` + `engine-strict`).
- Packages with install scripts must be approved in `package.json` `allowScripts`
  (`npm approve-scripts <pkg>`).
- Renovate's config has a shared block kept identical across the maintainer's repositories; this
  repo's own rules go at the end with a description starting `Repo-specific:`.

## Git and CI

- `main` is the only long-lived branch and accepts **rebase merges only**. Work on a short-lived
  branch and merge via PR (`gh pr merge <n> --rebase`).
- Conventional Commits, enforced by commitlint; body/footer lines at most 100 characters.
- The pre-commit hook (lefthook) runs prettier, `npm run check` and eslint --fix. Don't bypass it
  with `--no-verify` unless the user explicitly says so.
- CI (`.github/workflows/ci.yml`) is the source of truth: check, lint, dep:check, test, build,
  e2e. `release.yml` calls it on the release commit; release-only steps stay behind
  `inputs.release`.
- Releases come from release-please: merging its release PR publishes the GitHub release (draft,
  zip + attestation attached, then published and immutable). Never create `v*` tags or edit
  `CHANGELOG.md` by hand.

## Commands

`npm run dev` (load `.output/chrome-mv3-dev` unpacked) · `npm run check` · `npm run lint` ·
`npm run dep:check` · `npm run test` · `npm run test:e2e` (builds, then Playwright in `e2e/`) ·
`npm run build` · `npm run zip` ·
`npm run icons` (re-render `public/icon/` after editing `brand/*.svg`)
