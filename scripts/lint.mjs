// Launcher for the lint suite. `pnpm lint` used to chain
// `prettier --check . && eslint .`; the `&&` short-circuits, so a single
// prettier formatting nit aborts the run *before* eslint and silently hides
// every eslint violation repo-wide. (That is exactly how a stray-formatted
// .svelte file once masked all lint output until someone noticed by hand.)
//
// This launcher runs both checks unconditionally, streams both reports, and
// exits non-zero if *either* fails — a formatting issue can no longer hide a
// real lint error, and the lint output stays complete. Keep it read-only: the
// `format` script (prettier --write) and the lefthook eslint --fix are where
// auto-fixing happens.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Resolve the local bins directly so bare `node scripts/lint.mjs` works too —
// only `pnpm run` puts node_modules/.bin on PATH.
const bin = (/** @type {string} */ name) =>
	fileURLToPath(new URL(`../node_modules/.bin/${name}`, import.meta.url));

/** @type {[string, string[]][]} */
const steps = [
	[bin('prettier'), ['--check', '.']],
	// No --concurrency: ESLint v10's multithread linting doesn't write back
	// .eslintcache, so every local run would rebuild the type-aware program.
	// Single-threaded keeps the cache and a warm run drops to seconds.
	[bin('eslint'), ['.', '--cache', '--cache-strategy', 'content']]
];

let failed = false;
for (const [cmd, cmdArgs] of steps) {
	const res = spawnSync(cmd, cmdArgs, { stdio: 'inherit', env: process.env });
	if (res.error || res.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
