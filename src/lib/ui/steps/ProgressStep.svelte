<script lang="ts">
	import type { SweepProgress } from '@/lib/core/deleter';

	import Button from '../components/Button.svelte';
	import StepLayout from '../components/StepLayout.svelte';
	import { progressLabel } from '../format';
	import type { SweepSession } from '../session.svelte';

	interface Props {
		session: SweepSession;
		progress: SweepProgress | null;
		cancelling: boolean;
	}

	let { session, progress, cancelling }: Props = $props();

	const label = $derived(progressLabel(progress));

	// Screen readers hear the progress at most every 2 s, always the latest state.
	let announced = $state('');
	let announcedAt = 0;
	$effect(() => {
		const next = label;
		const wait = Math.max(0, announcedAt + 2_000 - Date.now());
		const timer = setTimeout(() => {
			announced = next;
			announcedAt = Date.now();
		}, wait);
		return () => clearTimeout(timer);
	});
</script>

<StepLayout>
	<p class="text-sm" aria-hidden="true">{label}</p>
	{#if progress?.phase === 'deleting'}
		<progress
			class="mt-3 h-2 w-full accent-signal"
			aria-label="Progress"
			max={progress.total}
			value={progress.done}
		></progress>
	{:else}
		<progress class="mt-3 h-2 w-full accent-signal" aria-label="Progress"></progress>
	{/if}
	<p class="sr-only" role="status">{announced}</p>
	<p class="mt-4 text-sm text-muted">
		Keep this tab open until it finishes. Cancelling stops before the next request; chats deleted
		until then stay deleted.
	</p>

	{#snippet actions()}
		<Button variant="secondary" disabled={cancelling} onclick={() => session.cancel()}>
			{cancelling ? 'Stopping after the current request…' : 'Cancel'}
		</Button>
	{/snippet}
</StepLayout>
