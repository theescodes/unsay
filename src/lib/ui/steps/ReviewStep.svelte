<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Star from '@lucide/svelte/icons/star';
	import { SvelteSet } from 'svelte/reactivity';

	import Button from '../components/Button.svelte';
	import StepLayout from '../components/StepLayout.svelte';
	import { chatTitle, count, groupByMonth, lastActiveLabel } from '../format';
	import type { SweepSession } from '../session.svelte';

	interface Props {
		session: SweepSession;
	}

	let { session }: Props = $props();

	const groups = $derived(groupByMonth(session.matches));
	// Collapsed by default, and rows only render for open months: no virtual list needed for
	// a few thousand chats.
	const expanded = new SvelteSet<string>();

	function toggle(key: string) {
		if (expanded.has(key)) expanded.delete(key);
		else expanded.add(key);
	}
</script>

<StepLayout>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<p class="text-sm" aria-live="polite">
			<strong>{session.selected.length}</strong> of {count(session.matches.length, 'chat')} selected
		</p>
		<div class="flex gap-1">
			<Button variant="ghost" size="sm" onclick={() => session.setSelected(session.matches, true)}>
				Select all
			</Button>
			<Button variant="ghost" size="sm" onclick={() => session.setSelected(session.matches, false)}>
				Select none
			</Button>
		</div>
	</div>

	<ul class="mt-3 divide-y divide-line rounded-lg border border-line">
		{#each groups as group (group.key)}
			<!-- A plain {const} is computed once per row; $derived keeps it in step with the clicks. -->
			{const picked = $derived(
				group.chats.filter((chat) => !session.excluded.has(chat.uuid)).length
			)}
			{const open = $derived(expanded.has(group.key))}
			<li>
				<div class="flex items-center gap-3 px-3 py-2">
					<input
						type="checkbox"
						class="accent-signal-ink"
						aria-label="Select all chats from {group.label}"
						checked={picked === group.chats.length}
						{@attach (box: HTMLInputElement) => {
							box.indeterminate = picked > 0 && picked < group.chats.length;
						}}
						onchange={(event) => session.setSelected(group.chats, event.currentTarget.checked)}
					/>
					<button
						type="button"
						class="flex flex-1 items-center gap-1 text-left text-sm font-medium"
						aria-expanded={open}
						aria-controls="unsay-month-{group.key}"
						onclick={() => toggle(group.key)}
					>
						<ChevronRight
							class={['size-4 text-muted transition-transform', open && 'rotate-90']}
							aria-hidden="true"
						/>
						{group.label}
						<span class="ml-auto font-normal text-muted">{picked} of {group.chats.length}</span>
					</button>
				</div>
				{#if open}
					<ul id="unsay-month-{group.key}" class="pb-2">
						{#each group.chats as chat (chat.uuid)}
							<li>
								<label class="flex items-start gap-3 py-1.5 pr-3 pl-9 text-sm hover:bg-bg2">
									<input
										type="checkbox"
										class="mt-0.5 accent-signal-ink"
										checked={!session.excluded.has(chat.uuid)}
										onchange={(event) => session.setSelected([chat], event.currentTarget.checked)}
									/>
									<span class="min-w-0 flex-1">
										<span class="block truncate">{chatTitle(chat)}</span>
										<span class="block text-xs text-muted">
											{lastActiveLabel(chat.updated_at, session.loadedAt)}
											{#if chat.project}· {chat.project.name}{/if}
										</span>
									</span>
									{#if chat.is_starred}
										<Star class="mt-0.5 size-4 shrink-0 text-signal-ink" aria-label="Starred" />
									{/if}
								</label>
							</li>
						{/each}
					</ul>
				{/if}
			</li>
		{/each}
	</ul>

	{#snippet actions()}
		<Button variant="secondary" onclick={() => session.back()}>Back</Button>
		<Button disabled={session.selected.length === 0} onclick={() => session.toConfirm()}>
			Continue with {count(session.selected.length, 'chat')}
		</Button>
	{/snippet}
</StepLayout>
