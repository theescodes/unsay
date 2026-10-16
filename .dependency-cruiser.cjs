// @ts-check
/**
 * dependency-cruiser config — architecture guardrails for the module graph.
 *
 * Enforced rules (all `error`):
 * - no circular dependencies;
 * - src/lib/core is framework-free: no Svelte, WXT, bits-ui or browser APIs, and
 *   no imports from the UI or the entrypoints. That keeps the code that decides
 *   what gets deleted testable in plain Node, against a fake claude.ai;
 * - shared library code (src/lib) never imports an entrypoint.
 *
 * This is the CI-side counterpart to ESLint's no-restricted-imports rules
 * (eslint.config.js): ESLint gives the in-editor signal, dep:check the whole graph.
 * Type-only imports are not flagged (`tsPreCompilationDeps: false`).
 *
 * `#imports` and the `@/` alias resolve through .wxt/tsconfig.json, so
 * `wxt prepare` must have run first (`pnpm install` runs it through `prepare`).
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
	forbidden: [
		{
			name: 'no-circular',
			severity: 'error',
			comment:
				'Circular dependencies make modules hard to reason about and can cause init-order bugs.',
			from: {},
			to: { circular: true }
		},
		{
			name: 'core-is-framework-free',
			severity: 'error',
			comment:
				'src/lib/core must stay plain TypeScript: no Svelte, WXT, bits-ui or extension APIs.',
			from: { path: '^src/lib/core/' },
			to: { path: ['node_modules/(svelte|wxt|@wxt-dev|bits-ui|@lucide)/', '^\\.wxt/'] }
		},
		{
			name: 'core-not-to-ui',
			severity: 'error',
			comment: 'src/lib/core must not depend on the UI or the entrypoints.',
			from: { path: '^src/lib/core/' },
			to: { path: '^src/(lib/ui|entrypoints)/' }
		},
		{
			name: 'lib-not-to-entrypoints',
			severity: 'error',
			comment: 'Entrypoints compose library code, never the other way round.',
			from: { path: '^src/lib/' },
			to: { path: '^src/entrypoints/' }
		}
	],
	options: {
		// node_modules is NOT in `exclude`: excluding it drops every edge into an npm package,
		// and core-is-framework-free above would silently never fire. doNotFollow is enough to
		// keep the cruise from walking into dependencies.
		doNotFollow: { path: 'node_modules' },
		exclude: { path: ['^\\.wxt/', '^\\.output/'] },
		tsConfig: { fileName: 'tsconfig.json' },
		tsPreCompilationDeps: false,
		enhancedResolveOptions: {
			extensions: ['.ts', '.js', '.mjs', '.cjs', '.json', '.svelte'],
			mainFields: ['module', 'main', 'types', 'typings'],
			conditionNames: ['import', 'require', 'node', 'default', 'types']
		}
	}
};
