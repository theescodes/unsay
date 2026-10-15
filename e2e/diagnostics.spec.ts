import { id, organization } from '../src/lib/core/testing/fixtures';
import { chat, expect, test } from './fixtures';

const PROJECT = id(8_000);
const LIST = 'GET /organizations/…/chat_conversations';
const DELETE_MANY = 'POST /organizations/…/chat_conversations/delete_many';

test.describe('diagnostics', () => {
	test('shows and copies counts and shapes, never a title, an id or a name', async ({ claude }) => {
		await claude.context.grantPermissions(['clipboard-read', 'clipboard-write'], {
			origin: 'https://claude.ai'
		});
		await claude.open({
			orgs: [organization({ name: 'SECRET org' })],
			chats: Array.from({ length: 150 }, (_, i) =>
				chat(i + 1, 40 + i, {
					name: `SECRET chat ${i + 1}`,
					project: i < 10 ? { uuid: PROJECT, name: 'SECRET project' } : null
				})
			)
		});

		const report = await claude.diagnostics();
		expect(report).toMatchObject({
			chats: { loaded: 150, projects: 1, inProjects: 10, newestFirst: true },
			answers: {
				[LIST]: {
					items: 'object 150',
					pages: [100, 50],
					fields: { project: 'null 140, object 10', 'project.name': 'string 10' }
				}
			}
		});
		const shown = await claude.panel.getByRole('textbox', { name: 'Diagnostics' }).inputValue();
		expect(shown).not.toMatch(/SECRET|example\.com/);
		expect(shown).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);

		await claude.panel.getByRole('button', { name: 'Copy' }).click();
		await expect(claude.panel.getByText('Copied. Paste it into the report.')).toBeVisible();
		expect(await claude.page.evaluate(() => navigator.clipboard.readText())).toBe(shown);

		await claude.panel.getByRole('button', { name: 'Back' }).click();
		await expect(claude.heading('Which chats should go?')).toBeVisible();
	});

	test('reports the run, and how claude.ai answered', async ({ claude }) => {
		await claude.open({ chats: [chat(1, 40), chat(2, 41), chat(3, 42)] });
		claude.fake.fail('POST', /\/delete_many$/, 429, { retryAfter: '1' });
		claude.allowConsoleError(/status of 429/);

		await claude.panel.getByRole('button', { name: 'Review 3 chats' }).click();
		await claude.confirmAndDelete(3);
		await expect(claude.heading('Done')).toBeVisible();

		expect(await claude.diagnostics()).toMatchObject({
			lastRun: { deleted: 3, failed: 0, cancelled: false },
			requests: { [DELETE_MANY]: { 200: 1, 429: 1 } },
			rateHeaders: ['retry-after (seconds)']
		});
	});

	test('shows the shape that stopped Unsay on the error screen', async ({ claude }) => {
		claude.allowConsoleError(/^\[Unsay\] loading failed/);
		await claude.open({ chats: [chat(1, 40), chat(2, 41, { is_starred: 'yes' })] });
		await expect(claude.heading('claude.ai changed')).toBeVisible();

		const report = await claude.diagnostics();
		expect(report.lastError).toMatch(/is_starred/);
		expect(report).toMatchObject({
			chats: null,
			answers: { [LIST]: { fields: { is_starred: 'false 1, string 1' } } }
		});
	});
});
