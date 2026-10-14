/** Messages between the background service worker and the claude.ai content script. */
export type Message = { type: 'toggle' } | { type: 'ready' };

/** The background's answer to `ready`: whether the panel should open right away. */
export interface ReadyReply {
	open: boolean;
}

/** Where a toolbar click outside claude.ai takes the tab. */
export const CLAUDE_HOME = 'https://claude.ai/recents';
