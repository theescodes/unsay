import { id, ORG } from '../src/lib/core/testing/fixtures';
import { chat, type ClaudeTab, expect, test } from './fixtures';

const DELETE_MANY = /\/delete_many$/;
const sorted = (ids: string[]) => [...ids].sort();

function modify(claude: ClaudeTab, n: number, changes: Record<string, unknown>) {
	const found = claude.fake.conversations(ORG).find((c) => c.uuid === id(n));
	if (!found) throw new Error(`no chat ${n}`);
	Object.assign(found, changes);
}

async function reviewAll(claude: ClaudeTab, total: number) {
	await claude.panel.getByRole('button', { name: `Review ${total} chats` }).click();
	await expect(claude.heading('Review the selection')).toBeVisible();
}

test.describe('when claude.ai misbehaves', () => {
	test('waits when asked to slow down, then carries on', async ({ claude }) => {
		await claude.open({ chats: [chat(1, 40), chat(2, 41), chat(3, 42)] });
		claude.fake.fail('POST', DELETE_MANY, 429, { retryAfter: '1' });
		claude.allowConsoleError(/status of 429/);

		await reviewAll(claude, 3);
		await claude.confirmAndDelete(3);
		await expect(claude.panel.getByText('3 chats deleted')).toBeVisible();
		expect(claude.fake.deleteCalls()).toHaveLength(2);
	});

	test('deletes one by one when a batch is refused', async ({ claude }) => {
		await claude.open({ chats: [chat(1, 40), chat(2, 41), chat(3, 42)] });
		claude.fake.fail('POST', DELETE_MANY, 400);
		claude.allowConsoleError(/status of 400/);

		await reviewAll(claude, 3);
		await claude.confirmAndDelete(3);
		await expect(claude.panel.getByText('3 chats deleted')).toBeVisible();
		expect(claude.fake.deleteCalls().map((call) => call.method)).toEqual([
			'POST',
			'DELETE',
			'DELETE',
			'DELETE'
		]);
	});

	test('reports a chat claude.ai keeps despite every attempt', async ({ claude }) => {
		await claude.open({ chats: [chat(1, 40), chat(2, 41), chat(3, 42)] });
		claude.fake.stubborn.add(id(2));

		await reviewAll(claude, 3);
		await claude.confirmAndDelete(3);
		await expect(claude.heading('Done')).toBeVisible();
		await expect(claude.panel.getByText('2 chats deleted')).toBeVisible();
		await expect(claude.panel.getByText('1 chat still there after every attempt')).toBeVisible();
		await expect(
			claude.panel.getByText('Start over to try the ones still there again.')
		).toBeVisible();
	});

	test('cancel stops before the next delete request', async ({ claude }) => {
		await claude.open({ chats: Array.from({ length: 120 }, (_, i) => chat(i + 1, 40 + i)) });
		const firstBatch = claude.hold('POST', DELETE_MANY);

		await reviewAll(claude, 120);
		await claude.confirmAndDelete(120);
		await firstBatch.reached;
		// Escape doesn't close the panel mid-run.
		await claude.page.keyboard.press('Escape');
		await expect(claude.panel).toBeVisible();
		await claude.panel.getByRole('button', { name: 'Cancel' }).click();
		await expect(
			claude.panel.getByRole('button', { name: 'Stopping after the current request…' })
		).toBeDisabled();
		firstBatch.release();

		await expect(claude.heading('Stopped')).toBeVisible();
		await expect(claude.panel.getByText('50 chats deleted')).toBeVisible();
		await expect(
			claude.panel.getByText('70 chats not touched: the run was cancelled first')
		).toBeVisible();
		expect(claude.fake.deleteCalls()).toHaveLength(1);
		expect(claude.fake.conversations(ORG)).toHaveLength(70);
	});

	test('changes after the review are respected', async ({ claude }) => {
		await claude.open({
			chats: [chat(1, 40), chat(2, 41), chat(3, 42), chat(4, 43), chat(5, 44)]
		});
		await reviewAll(claude, 5);
		await claude.panel.getByRole('button', { name: 'Continue with 5 chats' }).click();

		// Meanwhile, in another tab: one chat deleted, one written in, one starred.
		claude.fake.drop(ORG, id(1));
		modify(claude, 2, { updated_at: new Date().toISOString() });
		modify(claude, 3, { is_starred: true });

		await claude.panel.getByRole('textbox', { name: /to confirm$/ }).pressSequentially('delete 5');
		await claude.panel.getByRole('button', { name: 'Delete 5 chats' }).click();
		await expect(claude.heading('Done')).toBeVisible();
		await expect(claude.panel.getByText('2 chats deleted')).toBeVisible();
		await expect(
			claude.panel.getByText('1 chat left alone: used again after your review')
		).toBeVisible();
		await expect(
			claude.panel.getByText('1 chat left alone: starred after your review')
		).toBeVisible();
		await expect(claude.panel.getByText('1 chat already gone before the run')).toBeVisible();
		expect(sorted(claude.fake.deletedIds())).toEqual(sorted([id(4), id(5)]));
	});

	test('an answer it cannot read stops the panel before anything is deleted', async ({
		claude
	}) => {
		claude.allowConsoleError(/^\[Unsay\] loading failed/);
		await claude.open({ chats: [chat(1, 40), chat(2, 41, { is_starred: 'yes' })] });

		await expect(claude.heading('claude.ai changed')).toBeVisible();
		await expect(claude.panel.getByText('Nothing was deleted.')).toBeVisible();
		await claude.panel.getByText('Technical details').click();
		await expect(claude.panel.getByText(/is_starred/)).toBeVisible();
		expect(claude.fake.deleteCalls()).toEqual([]);
	});

	test('an answer it cannot read right before deleting stops the run', async ({ claude }) => {
		claude.allowConsoleError(/^\[Unsay\] the run failed/);
		await claude.open({ chats: [chat(1, 40), chat(2, 41)] });
		await reviewAll(claude, 2);
		await claude.panel.getByRole('button', { name: 'Continue with 2 chats' }).click();
		modify(claude, 2, { is_starred: 'yes' });

		await claude.panel.getByRole('textbox', { name: /to confirm$/ }).pressSequentially('delete 2');
		await claude.panel.getByRole('button', { name: 'Delete 2 chats' }).click();
		await expect(claude.heading('claude.ai changed')).toBeVisible();
		await expect(claude.panel.getByText('Nothing was deleted.')).toBeVisible();
		expect(claude.fake.deleteCalls()).toEqual([]);
		expect(claude.fake.conversations(ORG)).toHaveLength(2);
	});
});
