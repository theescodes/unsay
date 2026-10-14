import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

import { shadowCss } from './build/shadow-css';

// See https://wxt.dev/api/config.html
export default defineConfig({
	srcDir: 'src',
	modules: ['@wxt-dev/module-svelte'],
	// Explicit imports from '#imports' instead of auto-imports, so readers and
	// dependency-cruiser can see which module touches which WXT API.
	imports: false,
	manifest: {
		// The store shows `name` as the listing title; the toolbar tooltip stays short.
		name: 'Unsay — bulk-delete your claude.ai chats',
		short_name: 'Unsay',
		description:
			'Bulk-delete your claude.ai chats with filters. Open source, runs only on claude.ai.',
		// No popup: a toolbar click toggles the panel on claude.ai (see background.ts).
		action: { default_title: 'Unsay' }
	},
	// Load .output/chrome-mv3-dev unpacked into your own Chrome instead of letting WXT start a
	// fresh profile: the panel only makes sense with your logged-in claude.ai session.
	webExt: { disabled: true },
	vite: () => ({
		// shadowCss makes Tailwind's output work inside the panel's shadow root.
		plugins: [tailwindcss(), shadowCss()],
		// Ship readable code: anyone can audit exactly what the store serves.
		build: { minify: false }
	})
});
