import AxeBuilder from '@axe-core/playwright';

import { chat, type ClaudeTab, expect, test } from './fixtures';

/** WCAG 2.2 A and AA, checked on the panel only: the stand-in page around it isn't ours. */
async function expectAccessible(claude: ClaudeTab, step: string) {
	const { violations } = await new AxeBuilder({ page: claude.page })
		.include('unsay-panel')
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
		.analyze();
	const found = violations.map(
		(v) => `${v.id}: ${v.nodes.map((node) => node.target.join(' ')).join(' | ')}`
	);
	expect(found, `accessibility on the ${step} step`).toEqual([]);
}

/**
 * What the panel's CSS needs inside a shadow root (build/shadow-css.ts): Tailwind's shadows
 * (current Chromium no longer needs the fix for them, older versions do), and sizes that ignore
 * claude.ai's root font size, which the stand-in page sets to 20px.
 */
async function expectShadowRootCss(claude: ClaudeTab) {
	const { shadow, titleSize } = await claude.panel.evaluate((dialog) => {
		const title = dialog.querySelector('h2');
		return {
			shadow: getComputedStyle(dialog).boxShadow,
			titleSize: title ? getComputedStyle(title).fontSize : null
		};
	});
	const layers = shadow.split(/,(?![^(]*\))/);
	const visible = layers.some(
		(layer) => !layer.includes('rgba(0, 0, 0, 0)') && /\b[1-9]\d*px\b/.test(layer)
	);
	expect(visible, `box-shadow: ${shadow}`).toBe(true);
	// text-xl: 1.25rem at 16px, whatever claude.ai's root says.
	expect(titleSize, 'title font size').toBe('20px');
}

for (const mode of ['light', 'dark'] as const) {
	test.describe(`in ${mode} mode`, () => {
		test('every step is accessible and styled', async ({ claude }) => {
			await claude.open({
				mode,
				chats: [
					chat(1, 40, {
						project: { uuid: '9f000000-0000-4000-8000-000000000001', name: 'Research' }
					}),
					chat(2, 80),
					chat(3, 120, { is_starred: true })
				]
			});
			const { panel } = claude;
			if (mode === 'dark') await expect(panel).toContainClass('dark');
			else await expect(panel).not.toContainClass('dark');
			await expectShadowRootCss(claude);
			await expectAccessible(claude, 'filter');

			await claude.diagnostics();
			await expectAccessible(claude, 'diagnostics');
			await panel.getByRole('button', { name: 'Back' }).click();

			await panel.getByRole('checkbox', { name: /^Include starred chats/ }).check();
			await panel.getByRole('button', { name: 'Review 3 chats' }).click();
			await claude.expandMonths();
			await expectAccessible(claude, 'review');

			await panel.getByRole('button', { name: 'Continue with 3 chats' }).click();
			await expectAccessible(claude, 'confirm');

			await panel.getByRole('textbox', { name: /to confirm$/ }).pressSequentially('delete 3');
			await panel.getByRole('button', { name: 'Delete 3 chats' }).click();
			await expect(claude.heading('Done')).toBeVisible();
			await expectAccessible(claude, 'done');
		});

		test('the error screen is accessible', async ({ claude }) => {
			claude.allowConsoleError(/^\[Unsay\] loading failed/);
			await claude.open({ mode, chats: [chat(1, 40, { uuid: 'not-a-uuid' })] });
			await expect(claude.heading('claude.ai changed')).toBeVisible();
			await claude.panel.getByText('Technical details').click();
			await expectAccessible(claude, 'error');
		});
	});
}

test('follows claude.ai when it switches its theme while the panel is open', async ({ claude }) => {
	await claude.open({ chats: [chat(1, 40)] });
	await expect(claude.panel).not.toContainClass('dark');
	await claude.setMode('dark');
	await expect(claude.panel).toContainClass('dark');
	await claude.setMode('light');
	await expect(claude.panel).not.toContainClass('dark');
});
