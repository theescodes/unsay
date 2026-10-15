<script lang="ts">
	import Copy from '@lucide/svelte/icons/copy';

	import Button from '../components/Button.svelte';
	import StepLayout from '../components/StepLayout.svelte';
	import type { SweepSession } from '../session.svelte';

	interface Props {
		session: SweepSession;
		onback: () => void;
	}

	let { session, onback }: Props = $props();

	const REPORT_URL = 'https://github.com/theescodes/unsay/issues/new/choose';

	const text = $derived(session.diagnostics());
	let copied = $state<boolean | null>(null);
	let field = $state<HTMLTextAreaElement>();

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
		} catch {
			// claude.ai's page may not allow the clipboard; selecting leaves the user one keystroke.
			copied = false;
			field?.focus();
			field?.select();
		}
	}
</script>

<StepLayout>
	<p class="text-sm">
		For a compatibility or bug report: what claude.ai's answers to Unsay looked like, not what they
		said. Counts, field names and kinds of values; no chat titles, no ids, no names. Read it before
		you share it.
	</p>
	<textarea
		bind:this={field}
		readonly
		aria-label="Diagnostics"
		rows="14"
		spellcheck="false"
		class="mt-4 w-full resize-y rounded-lg border border-line-strong bg-bg2 px-3 py-2 font-mono text-xs text-ink"
		value={text}></textarea>
	<p class="mt-2 text-sm" aria-live="polite">
		{#if copied === true}
			Copied. Paste it into the report.
		{:else if copied === false}
			Couldn't copy it here. It is selected: copy it with Ctrl+C, or Command-C on a Mac.
		{/if}
	</p>
	<p class="mt-2 text-sm text-muted">
		Reports go on GitHub:
		<a href={REPORT_URL} target="_blank" rel="noopener" class="underline">open a report</a>. The
		text stays in this tab until you copy it; Unsay sends it nowhere.
	</p>

	{#snippet actions()}
		<Button variant="secondary" onclick={onback}>Back</Button>
		<Button onclick={copy}>
			<Copy class="size-4" aria-hidden="true" />
			Copy
		</Button>
	{/snippet}
</StepLayout>
