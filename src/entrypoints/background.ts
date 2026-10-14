import { CLAUDE_HOME, type Message, type ReadyReply } from '@/lib/messaging/messages';
import { browser, defineBackground } from '#imports';

export default defineBackground(() => {
	// Tabs we sent to claude.ai because the toolbar was clicked somewhere else; the panel
	// opens once that tab's content script reports in. Kept in memory only: if the service
	// worker is shut down in between, the user just clicks the icon again.
	const openOnReady = new Set<number>();

	async function togglePanel(tabId: number) {
		try {
			await browser.tabs.sendMessage<Message>(tabId, { type: 'toggle' });
		} catch {
			// No content script answered: the tab is not on claude.ai, or it was opened before
			// the extension was installed. Load claude.ai there and open the panel once ready.
			// This avoids the `tabs` permission, which reading tab.url would need.
			openOnReady.add(tabId);
			await browser.tabs.update(tabId, { url: CLAUDE_HOME });
		}
	}

	browser.action.onClicked.addListener((tab) => {
		if (tab.id !== undefined) void togglePanel(tab.id);
	});

	browser.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
		const tabId = sender.tab?.id;
		if (message.type !== 'ready' || tabId === undefined) return false;
		sendResponse({ open: openOnReady.delete(tabId) } satisfies ReadyReply);
		return false;
	});
});
