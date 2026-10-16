import { defineConfig } from '@playwright/test';

// The browser tests: the built extension in Chromium, with claude.ai replaced by the in-memory
// fake (e2e/fixtures.ts). `pnpm test:e2e` builds first; CI tests the build it ships.
export default defineConfig({
	testDir: 'e2e',
	// Every test launches its own browser with the extension, so they can run side by side.
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	// No retries: a test that passes on the second try hides a deleter that misbehaves sometimes.
	retries: 0,
	reporter: process.env.CI ? [['github'], ['list']] : 'list',
	use: { trace: 'retain-on-failure' }
});
