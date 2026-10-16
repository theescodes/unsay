import path from 'node:path';

import js from '@eslint/js';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import betterTailwindcss from 'eslint-plugin-better-tailwindcss';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

import svelteConfig from './svelte.config.js';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

// Shared by every projectService block. When the value differs between two files,
// typescript-eslint reloads the whole TS project before the second one; with .ts and
// .svelte files interleaved that happened on nearly every file and made a cold run
// crawl. See typescript-eslint "Typed Linting > Performance".
const extraFileExtensions = ['.svelte'];

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommendedTypeChecked,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.webextensions, ...globals.node },
			parserOptions: {
				projectService: true,
				extraFileExtensions,
				tsconfigRootDir: import.meta.dirname
			}
		},
		linterOptions: {
			// A disable directive that no longer suppresses anything is an error, not a
			// silent warning: `pnpm lint` passes no --max-warnings, so a stale directive
			// would otherwise rot unnoticed. Same for inline configs.
			reportUnusedDisableDirectives: 'error',
			reportUnusedInlineConfigs: 'error'
		},
		plugins: { 'simple-import-sort': simpleImportSort },
		rules: {
			// typescript-eslint strongly recommends disabling no-undef on TS projects.
			'no-undef': 'off',
			// Recommended-set rule, plus the opt-in check for always-true/false relational
			// comparisons (`x < 0` where x is provably non-negative).
			'no-constant-binary-expression': ['error', { checkRelationalComparisons: true }],
			// Honor the `_`-prefix convention for intentionally-unused bindings and
			// rest-sibling omits instead of one-off eslint-disable lines.
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
					ignoreRestSiblings: true
				}
			],
			// Deterministic, autofix-only import/export ordering.
			'simple-import-sort/imports': 'error',
			'simple-import-sort/exports': 'error'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions,
				parser: ts.parser,
				// Use the real svelte.config.js so parser options can't drift, but pass ONLY
				// its compilerOptions and override `runes`: the real value is a function
				// (it skips node_modules), which breaks the config serialization that
				// eslint --cache needs. ESLint never lints node_modules, so `true` is
				// equivalent for every file it parses.
				svelteConfig: {
					compilerOptions: { ...svelteConfig.compilerOptions, runes: true }
				}
			}
		},
		rules: {
			// $derived.by(() => expr) with a trivial zero-param body is just $derived(expr).
			'svelte/prefer-derived-over-derived-by': 'error',
			// {@const} is legacy since Svelte 5.56; declaration tags replace it.
			'svelte/no-at-const-tags': 'error',
			// `bind:value` on a checkbox/radio silently binds the wrong thing.
			'svelte/no-bind-value-on-checkable-inputs': 'error',
			// Cross-component prop and rune typing doesn't flow reliably through
			// svelte-eslint-parser + projectService. svelte-check covers correctness here.
			'@typescript-eslint/no-unsafe-assignment': 'off',
			'@typescript-eslint/no-unsafe-member-access': 'off',
			'@typescript-eslint/no-unsafe-call': 'off',
			'@typescript-eslint/no-unsafe-argument': 'off',
			'@typescript-eslint/no-unsafe-return': 'off'
		}
	},
	{
		// The @lucide/svelte barrel puts every icon type into each type check; icons are
		// imported one by one.
		files: ['**/*.ts', '**/*.svelte'],
		rules: {
			'@typescript-eslint/no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: '@lucide/svelte',
							message:
								"Import each icon from '@lucide/svelte/icons/<name>': the barrel puts all ~4,000 icon types into every type check."
						}
					]
				}
			]
		}
	},
	{
		// Module boundary: src/lib/core is plain TypeScript that runs anywhere (Node tests,
		// the content script). It talks to claude.ai through an injected fetch and never
		// touches Svelte, WXT or the extension APIs. Mirrored on the whole graph by
		// dependency-cruiser (pnpm dep:check).
		files: ['src/lib/core/**/*.ts'],
		rules: {
			'@typescript-eslint/no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['svelte', 'svelte/*', 'wxt', 'wxt/*', '#imports', '@wxt-dev/*', 'bits-ui'],
							message: 'src/lib/core stays framework-free: no Svelte, WXT or browser APIs.'
						},
						{
							group: ['@/lib/ui/*', '@/entrypoints/*', '../ui/*', '../../entrypoints/*'],
							message: 'src/lib/core must not depend on the UI or the entrypoints.'
						}
					]
				}
			]
		}
	},
	{
		// Tailwind class checks against the real theme. Class order and whitespace are left
		// to prettier-plugin-tailwindcss, so the plugin's presets aren't used.
		plugins: { 'better-tailwindcss': betterTailwindcss },
		settings: {
			'better-tailwindcss': {
				entryPoint: 'src/entrypoints/claude.content/style.css',
				rootFontSize: 16
			}
		},
		rules: {
			// collapse stays off: merging `text-sm leading-relaxed` into `text-sm/relaxed`
			// drops the --tw-leading variable a responsive variant would still inherit.
			'better-tailwindcss/enforce-canonical-classes': ['error', { collapse: false }],
			'better-tailwindcss/no-deprecated-classes': 'error',
			'better-tailwindcss/no-duplicate-classes': 'error',
			'better-tailwindcss/no-conflicting-classes': 'error',
			// `dark` marks the wrapper the dark: variant keys on (style.css), it is no utility.
			'better-tailwindcss/no-unknown-classes': ['error', { ignore: ['^dark$'] }]
		}
	},
	{
		// Plain JS outside the TS project graph: root config files and the .mjs scripts.
		// Type-checked rules would emit false positives on `any` from JSON.parse and friends.
		files: ['*.js', '*.cjs', '*.config.js', 'scripts/*.mjs'],
		extends: [ts.configs.disableTypeChecked]
	}
);
