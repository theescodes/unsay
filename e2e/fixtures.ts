import { existsSync } from 'node:fs';
import path from 'node:path';

import {
	type BrowserContext,
	expect,
	type Locator,
	type Page,
	test as base
} from '@playwright/test';

import { FakeClaude } from '../src/lib/core/testing/fake-claude';
import { conversation, ORG, organization } from '../src/lib/core/testing/fixtures';

/*
 * The browser tests run the built extension in Chromium on a stand-in claude.ai: every request
 * to https://claude.ai is answered here, the API by the same FakeClaude the unit tests use, and
 * every other host is blocked. Nothing ever reaches the real claude.ai.
 */

const EXTENSION = path.resolve(import.meta.dirname, '../.output/chrome-mv3');

type Json = Record<string, unknown>;
type Mode = 'light' | 'dark';

export interface World {
	/** Default: one organization with chats. */
	orgs?: Json[];
	/** The chats of the default organization, or chats per organization uuid. */
	chats?: Json[] | Record<string, Json[]>;
	/** The organization claude.ai last had open (its `lastActiveOrg` cookie). */
	activeOrg?: string;
	/** Where the tab is, e.g. `/chat/<uuid>`. Default: /recents. */
	path?: string;
	mode?: Mode;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A chat last active `days` ago. Unlike the unit tests' fixed clock, the extension in the
 * browser runs on real time, so the dates are relative to now.
 */
export function chat(n: number, days: number, overrides: Json = {}): Json {
	const ago = (d: number) => new Date(Date.now() - d * DAY_MS).toISOString();
	return conversation(n, { created_at: ago(days + 1), updated_at: ago(days), ...overrides });
}

/**
 * claude.ai's page, reduced to what the panel meets there: the theme attribute, a page-wide key
 * listener that feeds the message box (claude.ai has one, and it once swallowed what users typed
 * into the panel), and a root font size other than 16px, which the panel must not scale with.
 */
function claudePage(mode: Mode): string {
	return `<!doctype html>
<html lang="en" data-mode="${mode}" data-theme="claude">
	<head>
		<meta charset="utf-8">
		<title>Claude</title>
		<style>html { font-size: 20px; }</style>
	</head>
	<body>
		<main><textarea aria-label="Message"></textarea></main>
		<script>
			window.keysSeen = 0;
			for (const type of ['keydown', 'keyup', 'keypress', 'paste']) {
				document.addEventListener(type, () => {
					window.keysSeen++;
					document.querySelector('textarea').focus();
				});
			}
		</script>
	</body>
</html>`;
}

/** Holds back one API request until `release()`, so a test can act while it is in flight. */
export class Gate {
	readonly reached: Promise<void>;
	used = false;
	#arrive = () => {};
	#release = () => {};
	readonly #released = new Promise<void>((resolve) => (this.#release = resolve));

	constructor(
		readonly method: string,
		readonly path: RegExp
	) {
		this.reached = new Promise((resolve) => (this.#arrive = resolve));
	}

	async pass() {
		this.used = true;
		this.#arrive();
		await this.#released;
	}

	release() {
		this.#release();
	}
}

interface ChromeTabs {
	query(query: { active: boolean; currentWindow: boolean }): Promise<{ id?: number }[]>;
	sendMessage(tabId: number, message: unknown): Promise<unknown>;
}

export class ClaudeTab {
	fake = new FakeClaude([organization()], {});
	readonly panel: Locator;
	#mode: Mode = 'light';
	readonly #gates: Gate[] = [];
	readonly #errors: string[] = [];
	readonly #allowedErrors: RegExp[] = [];

	constructor(
		readonly context: BrowserContext,
		readonly page: Page
	) {
		this.panel = page.getByRole('dialog');
		page.on('console', (message) => {
			if (message.type() === 'error') this.#errors.push(message.text());
		});
		page.on('pageerror', (error) => this.#errors.push(String(error)));
	}

	async attach() {
		// Chrome's own log has what the console events miss: CSP violations, failed requests.
		const cdp = await this.context.newCDPSession(this.page);
		await cdp.send('Log.enable');
		cdp.on('Log.entryAdded', ({ entry }) => {
			if (entry.level === 'error') this.#errors.push(entry.text);
		});

		// Registered first, so it runs last: whatever the claude.ai routes don't answer is blocked.
		await this.context.route(
			(url) => url.protocol.startsWith('http') && url.hostname !== 'claude.ai',
			(route) => route.abort('blockedbyclient')
		);
		await this.context.route('https://claude.ai/**', (route) =>
			route.fulfill({ contentType: 'text/html', body: claudePage(this.#mode) })
		);
		await this.context.route('https://claude.ai/api/**', async (route) => {
			const request = route.request();
			const url = new URL(request.url());
			const gate = this.#gates.find(
				(g) => !g.used && g.method === request.method() && g.path.test(url.pathname)
			);
			if (gate) await gate.pass();
			const response = await this.fake.fetch(request.url(), {
				method: request.method(),
				body: request.postData() ?? undefined
			});
			await route.fulfill({
				status: response.status,
				headers: Object.fromEntries(response.headers),
				body: Buffer.from(await response.arrayBuffer())
			});
		});
	}

	/** Loads claude.ai with `world` behind it and opens the panel. */
	async open(world: World = {}) {
		const chats = world.chats ?? [];
		this.fake = new FakeClaude(
			world.orgs ?? [organization()],
			Array.isArray(chats) ? { [ORG]: chats } : chats
		);
		this.#mode = world.mode ?? 'light';
		if (world.activeOrg) {
			await this.context.addCookies([
				{
					name: 'lastActiveOrg',
					value: world.activeOrg,
					domain: 'claude.ai',
					path: '/',
					secure: true
				}
			]);
		}
		await this.page.goto(`https://claude.ai${world.path ?? '/recents'}`);
		await this.togglePanel();
		await expect(this.panel).toBeVisible();
	}

	/** What a toolbar click does on a claude.ai tab; Playwright can't click the toolbar itself. */
	async togglePanel() {
		const worker =
			this.context.serviceWorkers()[0] ?? (await this.context.waitForEvent('serviceworker'));
		// The content script listens once its UI is set up; until then the message finds no one.
		await expect(async () => {
			await worker.evaluate(async () => {
				const { tabs } = (globalThis as unknown as { chrome: { tabs: ChromeTabs } }).chrome;
				const [tab] = await tabs.query({ active: true, currentWindow: true });
				if (tab?.id === undefined) throw new Error('no active tab');
				await tabs.sendMessage(tab.id, { type: 'toggle' });
			});
		}).toPass({ timeout: 5_000 });
	}

	/** claude.ai switches its theme on `<html data-mode>`; the panel follows it. */
	async setMode(mode: Mode) {
		await this.page.evaluate((value) => (document.documentElement.dataset.mode = value), mode);
	}

	/** How many key and paste events reached claude.ai's own page-wide listeners. */
	keysSeenByPage(): Promise<number> {
		return this.page.evaluate(() => (window as unknown as { keysSeen: number }).keysSeen);
	}

	hold(method: string, path: RegExp): Gate {
		const gate = new Gate(method, path);
		this.#gates.push(gate);
		return gate;
	}

	/** A console error this test expects (a failed request, an error the panel logs). */
	allowConsoleError(pattern: RegExp) {
		this.#allowedErrors.push(pattern);
	}

	heading(name: string): Locator {
		return this.panel.getByRole('heading', { name, exact: true });
	}

	/** Opens every month in the review list. */
	async expandMonths() {
		const closed = this.panel.locator('button[aria-expanded="false"]');
		while ((await closed.count()) > 0) await closed.first().click();
	}

	/** From the review step: continue, type the confirmation and delete. */
	async confirmAndDelete(total: number) {
		const chats = `${new Intl.NumberFormat('en').format(total)} chat${total === 1 ? '' : 's'}`;
		await this.panel.getByRole('button', { name: `Continue with ${chats}` }).click();
		await expect(this.heading('Delete for good?')).toBeVisible();
		await this.panel
			.getByRole('textbox', { name: /to confirm$/ })
			.pressSequentially(`delete ${total}`);
		await this.panel.getByRole('button', { name: `Delete ${chats}` }).click();
	}

	/** Opens the Diagnostics view from the current step and returns the report it shows. */
	async diagnostics(): Promise<Record<string, unknown>> {
		await this.panel.getByRole('button', { name: 'Diagnostics' }).click();
		await expect(this.heading('Diagnostics')).toBeVisible();
		const text = await this.panel.getByRole('textbox', { name: 'Diagnostics' }).inputValue();
		return JSON.parse(text) as Record<string, unknown>;
	}

	unexpectedErrors(): string[] {
		return this.#errors.filter(
			(text) => !this.#allowedErrors.some((pattern) => pattern.test(text))
		);
	}

	releaseGates() {
		for (const gate of this.#gates) gate.release();
	}
}

export const test = base.extend<{ claude: ClaudeTab }>({
	context: async ({ playwright }, use) => {
		if (!existsSync(path.join(EXTENSION, 'manifest.json'))) {
			throw new Error(`No build in ${EXTENSION}: run \`npm run build\` first.`);
		}
		// The `chromium` channel is the full browser in its new headless mode, which runs
		// extensions; the default headless shell doesn't.
		const context = await playwright.chromium.launchPersistentContext('', {
			channel: 'chromium',
			args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`]
		});
		await use(context);
		await context.unrouteAll({ behavior: 'ignoreErrors' });
		await context.close();
	},
	page: async ({ context }, use) => {
		await use(context.pages()[0] ?? (await context.newPage()));
	},
	claude: async ({ context, page }, use) => {
		const tab = new ClaudeTab(context, page);
		await tab.attach();
		await use(tab);
		tab.releaseGates();
		expect(tab.unexpectedErrors(), 'console errors').toEqual([]);
	}
});

export { expect };
