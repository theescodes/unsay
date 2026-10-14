import { relative, sep } from 'node:path';

import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/vite-plugin-svelte').SvelteConfig} */
const config = {
	preprocess: vitePreprocess(),
	compilerOptions: {
		// Rune mode for the project, except for `node_modules`.
		// Can be removed in Svelte 6.
		runes: ({ filename }) => {
			const pathSegments = relative(import.meta.dirname, filename)
				.toLowerCase()
				.split(sep);
			return pathSegments.includes('node_modules') ? undefined : true;
		}
	}
};

export default config;
