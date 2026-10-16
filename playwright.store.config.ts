import { defineConfig } from '@playwright/test';

// Renders the Chrome Web Store screenshots (e2e/store-screenshots.ts) with the browser tests'
// fixtures. `pnpm screenshots` builds first, like `pnpm test:e2e`.
export default defineConfig({
	testDir: 'e2e',
	testMatch: 'store-screenshots.ts',
	reporter: 'list',
	timeout: 60_000
});
