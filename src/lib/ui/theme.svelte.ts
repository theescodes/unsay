import { createSubscriber, MediaQuery } from 'svelte/reactivity';

const prefersDark = new MediaQuery('(prefers-color-scheme: dark)');

/**
 * Follows claude.ai's colour scheme, which it keeps in `<html data-mode="light|dark">`
 * (docs/api-notes.md). Read-only: the panel never changes claude.ai's document. Falls back to
 * the system setting if claude.ai stops setting the attribute.
 */
class ClaudeTheme {
	#subscribe = createSubscriber((update) => {
		const observer = new MutationObserver(update);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-mode']
		});
		return () => observer.disconnect();
	});

	get dark(): boolean {
		this.#subscribe();
		const mode = document.documentElement.dataset.mode;
		return mode === 'dark' || (mode !== 'light' && prefersDark.current);
	}
}

export const theme = new ClaudeTheme();
