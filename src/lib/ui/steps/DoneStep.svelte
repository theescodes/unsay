<script lang="ts">
	import Download from '@lucide/svelte/icons/download';

	import { countOutcomes, type Outcome, type SweepResult } from '@/lib/core/deleter';
	import { receiptCsv } from '@/lib/core/receipt';
	import type { Conversation } from '@/lib/core/schemas';

	import Button from '../components/Button.svelte';
	import StepLayout from '../components/StepLayout.svelte';
	import { buttonClass } from '../components/styles';
	import { count, OUTCOME_TEXT } from '../format';
	import type { SweepSession } from '../session.svelte';

	interface Props {
		session: SweepSession;
		result: SweepResult;
		swept: Conversation[];
	}

	let { session, result, swept }: Props = $props();

	const counts = $derived(countOutcomes(result.outcomes));
	const lines = $derived(
		(Object.entries(OUTCOME_TEXT) as [Outcome, string][]).filter(([outcome]) => counts[outcome] > 0)
	);

	const receiptUrl = $derived(
		URL.createObjectURL(
			new Blob([receiptCsv(swept, result.outcomes)], { type: 'text/csv;charset=utf-8' })
		)
	);
	$effect(() => {
		const url = receiptUrl;
		return () => URL.revokeObjectURL(url);
	});
	const receiptName = `unsay-receipt-${new Date().toISOString().slice(0, 10)}.csv`;
</script>

<StepLayout>
	<ul class="space-y-1 text-sm">
		{#each lines as [outcome, text] (outcome)}
			<li>
				<strong class={[outcome === 'deleted' && 'text-ok']}
					>{count(counts[outcome], 'chat')}</strong
				>
				{text}
			</li>
		{/each}
	</ul>
	{#if counts.failed > 0}
		<p class="mt-3 text-sm">Start over to try the ones still there again.</p>
	{/if}
	<p class="mt-4 text-sm text-muted">
		claude.ai's sidebar can keep showing deleted chats for a few minutes, even after a reload.
		Opening one of them shows an error; they are gone.
	</p>

	{#snippet actions()}
		<a href={receiptUrl} download={receiptName} class={buttonClass('secondary')}>
			<Download class="size-4" aria-hidden="true" />
			Download receipt (CSV)
		</a>
		<Button onclick={() => session.refresh()}>Start over</Button>
	{/snippet}
</StepLayout>
