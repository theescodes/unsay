/**
 * Renders the extension icons in public/icon/ from brand/icon.svg (48 px and up) and
 * brand/icon-small.svg (16 and 32 px). Each size is rendered natively in Chromium rather
 * than downscaled, so small sizes stay sharp.
 *
 * The 128 px icon follows the Chrome Web Store guideline: 96 px of artwork with 16 px of
 * transparent padding on each side.
 *
 * Also renders brand/social-preview.png, the card GitHub shows when the repo is shared
 * (1280x640; upload it under Settings > Social preview, there is no API for it).
 *
 * Usage: pnpm icons
 */

import { readFile, writeFile } from 'node:fs/promises';

import { chromium } from 'playwright';

const ICONS = [
	{ size: 16, src: 'brand/icon-small.svg' },
	{ size: 32, src: 'brand/icon-small.svg' },
	{ size: 48, src: 'brand/icon.svg' },
	{ size: 96, src: 'brand/icon.svg' },
	{ size: 128, src: 'brand/icon.svg', padding: 16 }
];

const browser = await chromium.launch();
try {
	for (const { size, src, padding = 0 } of ICONS) {
		const svg = await readFile(src, 'utf8');
		const page = await browser.newPage({
			viewport: { width: size, height: size },
			deviceScaleFactor: 1,
			colorScheme: 'light'
		});
		const art = size - padding * 2;
		await page.setContent(
			`<!doctype html><html><head><style>
				*{margin:0;padding:0}
				html,body{width:${size}px;height:${size}px;overflow:hidden;background:transparent}
				body{display:grid;place-items:center}
				svg{width:${art}px;height:${art}px;display:block}
			</style></head><body>${svg}</body></html>`,
			{ waitUntil: 'load' }
		);
		await writeFile(
			`public/icon/${size}.png`,
			await page.screenshot({ type: 'png', omitBackground: true })
		);
		await page.close();
		console.log(`public/icon/${size}.png`);
	}

	const icon = await readFile('brand/icon.svg', 'utf8');
	const page = await browser.newPage({
		viewport: { width: 1280, height: 640 },
		deviceScaleFactor: 1,
		colorScheme: 'light'
	});
	// Colours from the panel's dark tokens; the font is the system UI font the panel uses too.
	await page.setContent(
		`<!doctype html><html><head><style>
			*{margin:0;padding:0}
			body{width:1280px;height:640px;background:#0a1c26;display:flex;align-items:center;
				gap:72px;padding:0 140px;box-sizing:border-box;font-family:system-ui,sans-serif}
			svg{width:240px;height:240px;flex:none}
			h1{color:#e9f0f2;font-size:128px;font-weight:800;letter-spacing:-0.03em;line-height:1}
			p{color:#9bb0b8;font-size:38px;line-height:1.35;margin-top:24px}
			small{display:block;color:#ff8a55;font-size:28px;margin-top:36px;font-weight:600}
		</style></head><body>${icon}<div>
			<h1>Unsay</h1>
			<p>Bulk-delete your claude.ai chats.<br>Open source, nothing leaves your browser.</p>
			<small>github.com/theescodes/unsay</small>
		</div></body></html>`,
		{ waitUntil: 'load' }
	);
	await writeFile('brand/social-preview.png', await page.screenshot({ type: 'png' }));
	await page.close();
	console.log('brand/social-preview.png');
} finally {
	await browser.close();
}
