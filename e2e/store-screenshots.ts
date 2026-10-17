import { organization } from '../src/lib/core/testing/fixtures';
import { chat, type ClaudeTab, expect, test } from './fixtures';

/*
 * Renders the Chrome Web Store screenshots into brand/store/ (`pnpm screenshots`): the built
 * extension on the stand-in claude.ai, with an invented account behind it. Not a test, so
 * `pnpm test:e2e` leaves it out; playwright.store.config.ts picks this file.
 *
 * The store takes 1280x800 and shows it at 640x400, so the page is 960x600 at 4/3: the panel
 * fills most of the frame and its text stays readable at the smaller size.
 */

test.use({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 4 / 3 });

const OUT = 'brand/store';

const TITLES = [
	'Trip plan for Lisbon in May',
	'Regex for parsing nginx logs',
	'Cover letter draft, product role',
	'Sourdough starter troubleshooting',
	'Explain Rust lifetimes with examples',
	'Birthday gift ideas under 50 euros',
	'SQL query for monthly active users',
	'Rewrite the README intro',
	'Marathon training, week 6',
	'Kubernetes ingress not routing',
	'Summarise the lease agreement',
	'Names for a houseplant shop',
	'Fix a flaky Playwright test',
	'Meal prep for a busy week',
	'Compare two job offers',
	'Bash script to rename photos',
	'Outline for chapter 3',
	'How do heat pumps work?',
	'Email to the landlord about heating',
	'Translate a menu into Italian',
	'Migrate a component to Svelte 5 runes',
	'Garden layout for a small balcony',
	'Budget spreadsheet formulas',
	'Debug a CORS error in fetch',
	'Book club questions',
	'Spanish verb drills',
	'Wedding toast, second draft',
	'TypeScript generics explained',
	'Packing list for a winter hike',
	'A polite follow-up email',
	'Kitchen renovation timeline',
	'Quarterly report summary',
	'Chord progressions for beginners',
	'Docker image too large',
	'Plan a board game night',
	'Refactor the payment service',
	'Bike commute route ideas',
	'Haiku about autumn rain',
	'Postgres index not used',
	'Weekend in Copenhagen'
];

const PROJECTS = [
	{ uuid: '9f000000-0000-4000-8000-000000000001', name: 'Work' },
	{ uuid: '9f000000-0000-4000-8000-000000000002', name: 'Home' },
	{ uuid: '9f000000-0000-4000-8000-000000000003', name: 'Study' }
];

/** 1,284 chats over a bit more than two years, some starred, some in projects. */
function account(total = 1_284) {
	return Array.from({ length: total }, (_, i) => {
		const n = i + 1;
		const project = n % 5 === 0 ? PROJECTS[n % PROJECTS.length] : null;
		return chat(n, n * 0.62, {
			// 7 and the list's length share no factor, so neighbouring chats get different titles.
			name: TITLES[(n * 7) % TITLES.length],
			is_starred: n % 41 === 3,
			project
		});
	});
}

/** A calm page behind the panel's backdrop, in the panel's own background colour. */
async function backdrop(claude: ClaudeTab, colour: string) {
	await claude.page.addStyleTag({
		content: `body { margin: 0; min-height: 100vh; background: ${colour}; } main { display: none; }`
	});
}

async function shoot(claude: ClaudeTab, name: string) {
	// No focus ring or hover state left over from the clicks that got here.
	await claude.page.mouse.move(0, 0);
	await claude.panel.evaluate((dialog) => {
		const root = dialog.getRootNode() as ShadowRoot;
		(root.activeElement as HTMLElement | null)?.blur();
	});
	await claude.page.screenshot({ path: `${OUT}/${name}.png` });
}

test('light: filter, review, confirm, done', async ({ claude }) => {
	await claude.open({ chats: account() });
	await backdrop(claude, '#eef3f2');
	const { panel } = claude;

	await panel.getByLabel('Last active').selectOption({ label: 'More than 6 months ago' });
	await panel.getByLabel('Project').selectOption({ label: 'Not in a project' });
	const review = panel.getByRole('button', { name: /^Review [\d,]+ chats$/ });
	await expect(review).toBeEnabled();
	await shoot(claude, 'screenshot-1-filter');

	await review.click();
	await expect(claude.heading('Review the selection')).toBeVisible();
	await panel.locator('button[aria-expanded="false"]').first().click();
	const rows = panel.getByRole('checkbox', { name: /^(?!Select)/ });
	await rows.nth(2).uncheck();
	await rows.nth(5).uncheck();
	// Unticking scrolled the list; the count and the month's header belong in the picture.
	await panel.getByRole('button', { name: 'Select all' }).scrollIntoViewIfNeeded();
	await shoot(claude, 'screenshot-2-review');

	const proceed = panel.getByRole('button', { name: /^Continue with [\d,]+ chats$/ });
	const selected = (await proceed.textContent())?.match(/[\d,]+/)?.[0].replaceAll(',', '');
	await proceed.click();
	await panel.getByRole('textbox', { name: /to confirm$/ }).pressSequentially(`delete ${selected}`);
	await shoot(claude, 'screenshot-3-confirm');

	await panel.getByRole('button', { name: /^Delete [\d,]+ chats$/ }).click();
	await expect(claude.heading('Done')).toBeVisible({ timeout: 30_000 });
	await shoot(claude, 'screenshot-4-done');
});

test('dark: two accounts', async ({ claude }) => {
	const personal = organization({ name: 'Personal' });
	const team = organization({
		id: 2,
		uuid: '4f000000-0000-4000-8000-000000000002',
		name: 'Team workspace',
		capabilities: ['claude_team', 'chat']
	});
	await claude.open({
		mode: 'dark',
		orgs: [personal, team],
		chats: { [personal.uuid as string]: account(), [team.uuid as string]: account(312) }
	});
	await backdrop(claude, '#0a1c26');
	await expect(claude.panel.getByLabel('Account')).toBeVisible();
	await shoot(claude, 'screenshot-5-accounts-dark');
});
