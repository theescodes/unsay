import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
	plugins: [
		// Polyfills `browser` with an in-memory fake and resolves wxt.config.ts's aliases. It
		// does not apply WXT modules, so the Svelte compiler is added here: without it the runes
		// in .svelte.ts modules never compile.
		WxtVitest(),
		svelte()
	],
	// Svelte's client runtime, so runes react in tests the way they do in the extension (the
	// server build renders once and never updates).
	resolve: { conditions: ['browser'] },
	test: {
		// A test that asserts nothing passes silently otherwise.
		expect: { requireAssertions: true },
		include: ['src/**/*.test.ts', 'build/**/*.test.ts']
	}
});
