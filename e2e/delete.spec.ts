import { readFile } from 'node:fs/promises';

import { id, ORG } from '../src/lib/core/testing/fixtures';
import { chat, expect, test } from './fixtures';

const sorted = (ids: string[]) => [...ids].sort();

test('deletes exactly what was reviewed and confirmed, and never a starred chat', async ({
	claude
}) => {
	await claude.open({
		chats: [chat(1, 2), chat(2, 40), chat(3, 45), chat(4, 100), chat(5, 50, { is_starred: true })]
	});
	const { panel, fake, page } = claude;

	await expect(panel.getByText('You have 1 starred chat.')).toBeVisible();
	await panel.getByLabel('Last active').selectOption({ label: 'More than 30 days ago' });
	await expect(panel.getByText('3 of 5 chats match.')).toBeVisible();
	await panel.getByRole('button', { name: 'Review 3 chats' }).click();

	await expect(claude.heading('Review the selection')).toBeVisible();
	await claude.expandMonths();
	await panel.getByRole('checkbox', { name: /^Chat 3\b/ }).uncheck();
	await expect(panel.getByText('2 of 3 chats selected')).toBeVisible();
	await panel.getByRole('button', { name: 'Continue with 2 chats' }).click();

	// The delete button only unlocks on the exact phrase for the exact count.
	const input = panel.getByRole('textbox', { name: 'Type delete 2 to confirm' });
	const button = panel.getByRole('button', { name: 'Delete 2 chats' });
	await input.pressSequentially('delete 3');
	await expect(button).toBeDisabled();
	await input.clear();
	await input.pressSequentially('delete 2');
	await expect(input).toHaveValue('delete 2');
	await expect(button).toBeEnabled();
	// Typed into the panel, never into claude.ai's page-wide key handlers.
	expect(await claude.keysSeenByPage()).toBe(0);
	expect(fake.deleteCalls()).toEqual([]);

	await button.click();
	await expect(claude.heading('Done')).toBeVisible();
	await expect(panel.getByText('2 chats deleted')).toBeVisible();
	expect(sorted(fake.deletedIds())).toEqual(sorted([id(2), id(4)]));
	expect(fake.conversations(ORG).map((c) => c.uuid)).toEqual([id(1), id(3), id(5)]);

	const download = page.waitForEvent('download');
	await panel.getByRole('link', { name: 'Download receipt (CSV)' }).click();
	const receipt = await readFile(await (await download).path(), 'utf8');
	// The BOM makes Excel read the titles as UTF-8 (receipt.ts).
	expect(receipt.charCodeAt(0)).toBe(0xfeff);
	const rows = receipt.slice(1).trimEnd().split('\r\n');
	expect(rows[0]).toBe('status,title,last_active,created,id');
	expect(sorted(rows.slice(1).map((row) => row.split(',')[4] as string))).toEqual(
		sorted([id(2), id(4)])
	);
	expect(rows.slice(1).every((row) => row.startsWith('deleted,'))).toBe(true);
});

test('deletes starred chats only when ticked, and says so before deleting', async ({ claude }) => {
	await claude.open({ chats: [chat(1, 40), chat(2, 40, { is_starred: true })] });
	const { panel, fake } = claude;

	await expect(panel.getByText('1 of 2 chats match.')).toBeVisible();
	await panel.getByRole('checkbox', { name: /^Include starred chats/ }).check();
	await expect(panel.getByText('2 of 2 chats match.')).toBeVisible();
	await panel.getByRole('button', { name: 'Review 2 chats' }).click();
	await panel.getByRole('button', { name: 'Continue with 2 chats' }).click();
	await expect(panel.getByText('1 starred chat is included.')).toBeVisible();

	await panel.getByRole('textbox', { name: /to confirm$/ }).pressSequentially('delete 2');
	await panel.getByRole('button', { name: 'Delete 2 chats' }).click();
	await expect(panel.getByText('2 chats deleted')).toBeVisible();
	expect(fake.conversations(ORG)).toEqual([]);
});

test('deletes the chat open in this tab last, on its own', async ({ claude }) => {
	await claude.open({
		chats: [chat(1, 40), chat(2, 41), chat(3, 42), chat(4, 43)],
		path: `/chat/${id(2)}`
	});
	const { panel, fake } = claude;

	await panel.getByRole('button', { name: 'Review 4 chats' }).click();
	await panel.getByRole('button', { name: 'Continue with 4 chats' }).click();
	await expect(panel.getByText('The chat open in this tab is included.')).toBeVisible();
	await panel.getByRole('textbox', { name: /to confirm$/ }).pressSequentially('delete 4');
	await panel.getByRole('button', { name: 'Delete 4 chats' }).click();
	await expect(panel.getByText('4 chats deleted')).toBeVisible();

	const calls = fake.deleteCalls();
	expect(calls.at(-1)).toMatchObject({
		method: 'DELETE',
		path: expect.stringMatching(`${id(2)}$`)
	});
	const before = calls
		.slice(0, -1)
		.flatMap((call) =>
			call.method === 'DELETE'
				? [call.path]
				: (call.body as { conversation_uuids: string[] }).conversation_uuids
		);
	expect(before.join()).not.toContain(id(2));
	expect(fake.conversations(ORG)).toEqual([]);
});
