<script lang="ts">
	import X from '@lucide/svelte/icons/x';

	import Button from './components/Button.svelte';
	import StepLayout from './components/StepLayout.svelte';
	import { buttonClass } from './components/styles';
	import { count } from './format';
	import type { SweepSession } from './session.svelte';
	import ConfirmStep from './steps/ConfirmStep.svelte';
	import DiagnosticsStep from './steps/DiagnosticsStep.svelte';
	import DoneStep from './steps/DoneStep.svelte';
	import FilterStep from './steps/FilterStep.svelte';
	import ProgressStep from './steps/ProgressStep.svelte';
	import ReviewStep from './steps/ReviewStep.svelte';
	import { theme } from './theme.svelte';

	interface Props {
		session: SweepSession;
		onclose: () => void;
	}

	let { session, onclose }: Props = $props();

	/** Shown over the filter, done or error step; Back returns to it. */
	let diagnostics = $state(false);
	const showDiagnostics = () => (diagnostics = true);

	const step = $derived(session.step);
	const title = $derived.by(() => {
		if (diagnostics) return 'Diagnostics';
		switch (step.kind) {
			case 'loading':
				return 'Loading your chats';
			case 'filter':
				return 'Which chats should go?';
			case 'review':
				return 'Review the selection';
			case 'confirm':
				return 'Delete for good?';
			case 'running':
				return 'Deleting';
			case 'done':
				return step.result.cancelled ? 'Stopped' : 'Done';
			case 'error':
				return step.text.title;
		}
	});
</script>

<!--
	A native modal <dialog>: it renders in the top layer above claude.ai, makes the page
	behind it inert, traps focus and closes on Escape — without bits-ui's Dialog, which
	portals to document.body and locks claude.ai's body scroll. During a run Escape does
	nothing; if the panel closes anyway, the run goes on and reopening shows it.
-->
<dialog
	{@attach (dialog) => dialog.showModal()}
	{onclose}
	oncancel={(event) => {
		if (session.running) event.preventDefault();
	}}
	aria-labelledby="unsay-title"
	class={[
		'm-auto max-h-[min(90vh,46rem)] w-[min(94vw,38rem)] flex-col rounded-xl border border-line bg-surface p-0 font-sans text-ink scheme-light shadow-xl shadow-shadow backdrop:bg-shadow open:flex dark:scheme-dark',
		theme.dark && 'dark'
	]}
>
	<header class="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
		<div>
			<p class="text-xs font-medium tracking-wider text-signal-ink uppercase">Unsay</p>
			<h2 id="unsay-title" class="mt-1 text-xl font-bold tracking-tight">{title}</h2>
		</div>
		{#if !session.running}
			<form method="dialog">
				<button class={buttonClass('ghost', 'sm')} aria-label="Close">
					<X class="size-4" aria-hidden="true" />
				</button>
			</form>
		{/if}
	</header>

	{#if diagnostics}
		<DiagnosticsStep {session} onback={() => (diagnostics = false)} />
	{:else if step.kind === 'loading'}
		<StepLayout>
			<p class="text-sm text-muted">
				{step.loaded > 0 ? `${count(step.loaded, 'chat')} loaded…` : 'Asking claude.ai…'}
			</p>
			<progress class="mt-3 h-2 w-full accent-signal" aria-label="Loading"></progress>
		</StepLayout>
	{:else if step.kind === 'filter'}
		<FilterStep {session} ondiagnostics={showDiagnostics} />
	{:else if step.kind === 'review'}
		<ReviewStep {session} />
	{:else if step.kind === 'confirm'}
		<ConfirmStep {session} />
	{:else if step.kind === 'running'}
		<ProgressStep {session} progress={step.progress} cancelling={step.cancelling} />
	{:else if step.kind === 'done'}
		<DoneStep {session} result={step.result} swept={step.swept} ondiagnostics={showDiagnostics} />
	{:else}
		<StepLayout>
			<p class="text-sm">{step.text.detail}</p>
			<p class="mt-2 text-sm text-muted">{step.text.consequence}</p>
			{#if step.text.technical}
				<details class="mt-4 text-xs text-muted">
					<summary class="cursor-pointer">Technical details</summary>
					<pre class="mt-2 font-mono whitespace-pre-wrap">{step.text.technical}</pre>
				</details>
			{/if}
			{#snippet actions()}
				<Button variant="ghost" class="me-auto" onclick={showDiagnostics}>Diagnostics</Button>
				<Button onclick={() => session.refresh()}>Try again</Button>
			{/snippet}
		</StepLayout>
	{/if}
</dialog>
