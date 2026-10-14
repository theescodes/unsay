<script lang="ts">
	import Button from '../components/Button.svelte';
	import StepLayout from '../components/StepLayout.svelte';
	import { confirmPhrase, count, isConfirmed } from '../format';
	import type { SweepSession } from '../session.svelte';

	interface Props {
		session: SweepSession;
	}

	let { session }: Props = $props();

	let typed = $state('');
	const total = $derived(session.selected.length);
	const starred = $derived(session.selected.filter((chat) => chat.is_starred).length);
	const confirmed = $derived(isConfirmed(typed, total));
	const openChat = $derived(session.openChatSelected());
</script>

<form
	class="contents"
	onsubmit={(event) => {
		event.preventDefault();
		if (confirmed) void session.run();
	}}
>
	<StepLayout>
		<div class="space-y-3 text-sm">
			<p>
				You are about to permanently delete <strong>{count(total, 'chat')}</strong>. claude.ai can't
				restore them.
			</p>
			{#if starred > 0}
				<p>
					<strong>{count(starred, 'starred chat')}</strong>
					{starred === 1 ? 'is' : 'are'} included.
				</p>
			{/if}
			{#if openChat}
				<p class="text-muted">
					The chat open in this tab is included. It is deleted last, after all the others are done
					and checked. claude.ai may reload the page then.
				</p>
			{/if}
		</div>

		<label for="unsay-confirm" class="mt-6 block text-sm font-medium">
			Type <kbd class="rounded-sm bg-bg2 px-1.5 py-0.5 font-mono">{confirmPhrase(total)}</kbd> to confirm
		</label>
		<input
			id="unsay-confirm"
			class="mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 font-mono text-sm text-ink"
			autocomplete="off"
			spellcheck="false"
			bind:value={typed}
		/>

		{#snippet actions()}
			<Button variant="secondary" onclick={() => session.back()}>Back</Button>
			<Button type="submit" variant="danger" disabled={!confirmed}>
				Delete {count(total, 'chat')}
			</Button>
		{/snippet}
	</StepLayout>
</form>
