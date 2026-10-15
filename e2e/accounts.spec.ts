import { id, ORG, organization } from '../src/lib/core/testing/fixtures';
import { chat, expect, test } from './fixtures';

/*
 * Accounts unlike the one claude.ai's API was observed on (one organization, 82 chats, no
 * projects; docs/api-notes.md). Where the real shape was never seen, the fake uses the most
 * likely one, and the test pins down what the panel does with it.
 */

const sorted = (ids: string[]) => [...ids].sort();

test('loads thousands of chats page by page and deletes them in batches', async ({ claude }) => {
	const total = 2_500;
	// Spread over about two years, so the review has many months.
	await claude.open({ chats: Array.from({ length: total }, (_, i) => chat(i + 1, 1 + i / 4)) });
	const { panel, fake } = claude;

	await expect(panel.getByText('2500 of 2,500 chats match.')).toBeVisible();
	await panel.getByRole('button', { name: 'Review 2,500 chats' }).click();
	await expect(panel.getByText('2500 of 2,500 chats selected')).toBeVisible();
	await claude.confirmAndDelete(total);
	await expect(panel.getByText('2,500 chats deleted')).toBeVisible({ timeout: 30_000 });

	expect(fake.conversations(ORG)).toEqual([]);
	const firstLoad = fake.calls
		.filter((call) => call.method === 'GET' && call.path.includes('/chat_conversations?'))
		.slice(0, 26)
		.map((call) => call.path.replace(/^.*\?/, ''));
	expect(firstLoad).toEqual(
		Array.from({ length: 26 }, (_, page) => `limit=100&offset=${page * 100}`)
	);
	const batches = fake
		.deleteCalls()
		.map((call) => (call.body as { conversation_uuids: string[] }).conversation_uuids.length);
	expect(batches).toEqual(Array.from({ length: 50 }, () => 50));
});

test('filters by project; chats of an unknown project only match "Any"', async ({ claude }) => {
	const research = { uuid: id(9001), name: 'Research' };
	const travel = { uuid: id(9002), name: 'Travel' };
	await claude.open({
		chats: [
			chat(1, 40, { project: research }),
			chat(2, 41, { project: research }),
			chat(3, 42, { project: travel }),
			chat(4, 43),
			chat(5, 44),
			// A project shape the schema can't read: membership unknown.
			chat(6, 45, { project: { id: 7 } })
		]
	});
	const { panel, fake } = claude;
	const project = panel.getByLabel('Project');

	await expect(project.getByRole('option')).toHaveText([
		'Any, or none',
		'Not in a project',
		'Research (2)',
		'Travel (1)'
	]);
	await expect(panel.getByText("claude.ai didn't say which project 1 chat is in.")).toBeVisible();

	await project.selectOption({ label: 'Not in a project' });
	await expect(panel.getByText('2 of 6 chats match.')).toBeVisible();
	await project.selectOption({ label: 'Research (2)' });
	await expect(panel.getByText('2 of 6 chats match.')).toBeVisible();

	await panel.getByRole('button', { name: 'Review 2 chats' }).click();
	await claude.expandMonths();
	await expect(panel.getByRole('checkbox', { name: /^Chat 1\b.*Research/ })).toBeChecked();
	await claude.confirmAndDelete(2);
	await expect(panel.getByText('2 chats deleted')).toBeVisible();
	expect(sorted(fake.deletedIds())).toEqual(sorted([id(1), id(2)]));
});

test('with several accounts, preselects the open one and deletes only in the chosen one', async ({
	claude
}) => {
	const personal = '4f000000-0000-4000-8000-00000000000a';
	const team = '4f000000-0000-4000-8000-00000000000b';
	const apiOnly = '4f000000-0000-4000-8000-00000000000c';
	await claude.open({
		orgs: [
			organization({ uuid: personal, name: 'Personal' }),
			organization({ uuid: team, name: 'Team workspace', capabilities: ['chat', 'claude_team'] }),
			organization({ uuid: apiOnly, name: 'API only', capabilities: ['api'] })
		],
		chats: {
			[personal]: [chat(1, 40), chat(2, 41)],
			[team]: [chat(3, 40), chat(4, 41), chat(5, 42)]
		},
		activeOrg: team
	});
	const { panel, fake } = claude;
	const account = panel.getByLabel('Account');

	await expect(account).toHaveValue(team);
	await expect(account.getByRole('option')).toHaveText(['Personal', 'Team workspace']);
	await expect(panel.getByText('3 of 3 chats match.')).toBeVisible();

	await account.selectOption({ label: 'Personal' });
	await expect(panel.getByText('2 of 2 chats match.')).toBeVisible();
	await panel.getByRole('button', { name: 'Review 2 chats' }).click();
	await claude.confirmAndDelete(2);
	await expect(panel.getByText('2 chats deleted')).toBeVisible();

	expect(
		fake.deleteCalls().every((call) => call.path.includes(`/organizations/${personal}/`))
	).toBe(true);
	expect(fake.conversations(personal)).toEqual([]);
	expect(fake.conversations(team)).toHaveLength(3);
	expect(fake.calls.some((call) => call.path.includes(apiOnly))).toBe(false);
});
