/**
 * Renders the extension icons in public/icon/ from brand/icon.svg (48 px and up) and
 * brand/icon-small.svg (16 and 32 px). Each size is rendered natively in Chromium rather
 * than downscaled, so small sizes stay sharp.
 *
 * The 128 px icon follows the Chrome Web Store guideline: 96 px of artwork with 16 px of
 * transparent padding on each side.
 *
 * Also renders brand/social-preview.png, the card GitHub shows when the repo is shared
 * (1280x640; upload it under Settings > Social preview, there is no API for it), and the
 * Chrome Web Store's promo tiles in brand/store/ (440x280 small, 1400x560 marquee; uploaded by
 * hand with the listing, see docs/store-listing.md).
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
	const TAGLINE = 'Bulk-delete your claude.ai chats.<br>Open source, nothing leaves your browser.';
	const REPO = 'github.com/theescodes/unsay';
	// Sizes in px; `url: 0` leaves the repo line out. The small tile shows at its own size in the
	// store, so it says less, larger. The social preview keeps its left-aligned layout.
	const CARDS = [
		{
			path: 'brand/social-preview.png',
			width: 1280,
			height: 640,
			inset: 140,
			tagline: TAGLINE,
			icon: 240,
			gap: 72,
			title: 128,
			text: 38,
			url: 28
		},
		{
			path: 'brand/store/promo-marquee.png',
			width: 1400,
			height: 560,
			inset: null,
			tagline: TAGLINE,
			icon: 220,
			gap: 72,
			title: 120,
			text: 36,
			url: 26
		},
		{
			path: 'brand/store/promo-small.png',
			width: 440,
			height: 280,
			inset: null,
			tagline: 'Bulk-delete your<br>claude.ai chats.',
			icon: 104,
			gap: 28,
			title: 60,
			text: 21,
			url: 0
		}
	];
	for (const card of CARDS) {
		const page = await browser.newPage({
			viewport: { width: card.width, height: card.height },
			deviceScaleFactor: 1,
			colorScheme: 'light'
		});
		// Colours from the panel's dark tokens; the font is the system UI font the panel uses too.
		await page.setContent(
			`<!doctype html><html><head><style>
				*{margin:0;padding:0}
				body{width:${card.width}px;height:${card.height}px;background:#0a1c26;display:flex;
					align-items:center;gap:${card.gap}px;box-sizing:border-box;
					${card.inset === null ? 'justify-content:center' : `padding:0 ${card.inset}px`};
					font-family:system-ui,sans-serif}
				svg{width:${card.icon}px;height:${card.icon}px;flex:none}
				h1{color:#e9f0f2;font-size:${card.title}px;font-weight:800;letter-spacing:-0.03em;
					line-height:1}
				p{color:#9bb0b8;font-size:${card.text}px;line-height:1.35;margin-top:${Math.round(card.text * 0.63)}px}
				small{display:block;color:#ff8a55;font-size:${card.url}px;margin-top:36px;font-weight:600}
			</style></head><body>${icon}<div>
				<h1>Unsay</h1>
				<p>${card.tagline}</p>
				${card.url ? `<small>${REPO}</small>` : ''}
			</div></body></html>`,
			{ waitUntil: 'load' }
		);
		await writeFile(card.path, await page.screenshot({ type: 'png' }));
		await page.close();
		console.log(card.path);
	}
} finally {
	await browser.close();
}
