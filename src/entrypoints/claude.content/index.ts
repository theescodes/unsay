import './style.css';

import { mount, unmount } from 'svelte';

import { createClaudeApi } from '@/lib/core/api';
import { describeBrowser, DiagnosticsRecorder, type UserAgentData } from '@/lib/core/diagnostics';
import type { Message, ReadyReply } from '@/lib/messaging/messages';
import Panel from '@/lib/ui/Panel.svelte';
import { SweepSession } from '@/lib/ui/session.svelte';
import { browser, createShadowRootUi, defineContentScript } from '#imports';

export default defineContentScript({
	matches: ['https://claude.ai/*'],
	// The panel's CSS goes into its shadow root, so claude.ai's styles and ours never meet.
	cssInjectionMode: 'ui',

	async main(ctx) {
		let isOpen = false;
		// Watches Unsay's own requests to claude.ai, in memory only, for the Diagnostics view.
		const recorder = new DiagnosticsRecorder();
		// Not in TypeScript's DOM types yet.
		const { userAgentData } = navigator as Navigator & { userAgentData?: UserAgentData };

		// Outlives the panel: closing it mid-run doesn't stop the run.
		const session = new SweepSession({
			// The content script's own fetch: same origin as claude.ai, so the session cookie goes
			// along as it does for the web app.
			api: createClaudeApi(recorder.wrap((input, init) => fetch(input, init))),
			activeOrgId: () => document.cookie.match(/(?:^|;\s*)lastActiveOrg=([^;]+)/)?.[1] ?? null,
			openChatId: () => location.pathname.match(/^\/chat\/([0-9a-f-]{36})(?:\/|$)/i)?.[1] ?? null,
			diagnostics: {
				recorder,
				version: browser.runtime.getManifest().version,
				browser: describeBrowser(userAgentData)
			}
		});

		const ui = await createShadowRootUi(ctx, {
			name: 'unsay-panel',
			position: 'inline',
			anchor: 'body',
			append: 'last',
			// claude.ai listens for keys and pastes on its whole page to feed its message box, and
			// takes them from the panel's inputs too (typing into the confirm field did nothing).
			// Stop them at the shadow root so they never reach claude.ai's handlers.
			isolateEvents: ['keydown', 'keyup', 'keypress', 'paste'],
			onMount: (container) =>
				mount(Panel, { target: container, props: { session, onclose: close } }),
			onRemove: (panel) => {
				if (panel) void unmount(panel);
			}
		});

		function open() {
			if (isOpen) return;
			ui.mount();
			isOpen = true;
			session.start();
		}

		function close() {
			if (!isOpen) return;
			ui.remove();
			isOpen = false;
		}

		browser.runtime.onMessage.addListener((message: Message) => {
			if (message.type === 'toggle') {
				if (isOpen) close();
				else open();
			}
			return false;
		});

		// Tell the background we are here; it answers `open` when a toolbar click on another
		// page brought this tab to claude.ai.
		const reply = await browser.runtime.sendMessage<Message, ReadyReply | undefined>({
			type: 'ready'
		});
		if (reply?.open) open();
	}
});
