<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		/** Buttons in the footer, right-aligned. */
		actions?: Snippet;
	}

	let { children, actions }: Props = $props();
</script>

<!-- The body scrolls; header and footer stay put however long the review list gets. -->
<div class="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
	{@render children()}
</div>
{#if actions}
	<div class="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4">
		{@render actions()}
	</div>
{/if}
