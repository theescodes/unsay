<script lang="ts">
	import type { ProjectFilter } from '@/lib/core/filters';

	import Button from '../components/Button.svelte';
	import StepLayout from '../components/StepLayout.svelte';
	import { count, formatNumber } from '../format';
	import type { SweepSession } from '../session.svelte';

	interface Props {
		session: SweepSession;
		ondiagnostics: () => void;
	}

	let { session, ondiagnostics }: Props = $props();

	const AGES: [days: number | null, label: string][] = [
		[null, 'Any time'],
		[7, 'More than a week ago'],
		[30, 'More than 30 days ago'],
		[90, 'More than 3 months ago'],
		[180, 'More than 6 months ago'],
		[365, 'More than a year ago']
	];

	function projectValue(filter: ProjectFilter): string {
		return filter.kind === 'in' ? (filter.ids[0] ?? 'any') : filter.kind;
	}

	function projectFilter(value: string): ProjectFilter {
		return value === 'any' || value === 'none' ? { kind: value } : { kind: 'in', ids: [value] };
	}

	const labelClass = 'block text-sm font-medium';
	const fieldClass =
		'mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink';
</script>

<StepLayout>
	<div class="space-y-4">
		{#if session.orgs.length > 1}
			<div>
				<label for="unsay-org" class={labelClass}>Account</label>
				<select
					id="unsay-org"
					class={fieldClass}
					value={session.orgId}
					onchange={(event) => session.selectOrg(event.currentTarget.value)}
				>
					{#each session.orgs as org (org.uuid)}
						<option value={org.uuid}>{org.name || 'Unnamed account'}</option>
					{/each}
				</select>
			</div>
		{/if}

		<div>
			<label for="unsay-age" class={labelClass}>Last active</label>
			<select id="unsay-age" class={fieldClass} bind:value={session.filters.olderThanDays}>
				{#each AGES as [days, label] (label)}
					<option value={days}>{label}</option>
				{/each}
			</select>
		</div>

		<div>
			<label for="unsay-title" class={labelClass}>Title contains</label>
			<input
				id="unsay-title"
				type="search"
				class={fieldClass}
				autocomplete="off"
				spellcheck="false"
				bind:value={session.filters.titleContains}
			/>
		</div>

		<div>
			<label for="unsay-project" class={labelClass}>Project</label>
			<select
				id="unsay-project"
				class={fieldClass}
				bind:value={
					() => projectValue(session.filters.project),
					(value) => (session.filters.project = projectFilter(value))
				}
			>
				<option value="any">Any, or none</option>
				<option value="none">Not in a project</option>
				{#each session.projects as project (project.uuid)}
					<option value={project.uuid}>{project.name} ({project.count})</option>
				{/each}
			</select>
			{#if session.unknownProjectCount > 0}
				<p class="mt-1 text-xs text-muted">
					claude.ai didn't say which project {count(session.unknownProjectCount, 'chat')}
					{session.unknownProjectCount === 1 ? 'is' : 'are'} in. Only "Any, or none" includes
					{session.unknownProjectCount === 1 ? 'it' : 'them'}.
				</p>
			{/if}
		</div>

		<label class="flex items-start gap-2 text-sm">
			<input
				type="checkbox"
				class="mt-0.5 accent-signal-ink"
				bind:checked={session.filters.includeStarred}
			/>
			<span>
				Include starred chats
				<span class="block text-muted">
					Starred chats are left alone unless you tick this. You have {count(
						session.starredCount,
						'starred chat'
					)}.
				</span>
			</span>
		</label>
	</div>

	<p class="mt-6 text-sm" aria-live="polite">
		{#if session.conversations.length === 0}
			This account has no chats.
		{:else}
			<strong>{formatNumber(session.matches.length)}</strong> of {count(
				session.conversations.length,
				'chat'
			)}
			match.
		{/if}
	</p>
	<p class="mt-2 text-xs text-muted">
		Deleting is permanent. Want a copy first? claude.ai can export your data from its
		<a href="https://claude.ai/settings" target="_blank" rel="noopener" class="underline">
			settings</a
		>.
	</p>

	{#snippet actions()}
		<Button variant="ghost" class="me-auto" onclick={ondiagnostics}>Diagnostics</Button>
		<Button disabled={session.matches.length === 0} onclick={() => session.review()}>
			Review {count(session.matches.length, 'chat')}
		</Button>
	{/snippet}
</StepLayout>
