<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	import { buttonClass, type ButtonSize, type ButtonVariant } from './styles';

	interface Props extends HTMLButtonAttributes {
		variant?: ButtonVariant;
		size?: ButtonSize;
		children: Snippet;
	}

	let {
		variant = 'primary',
		size = 'md',
		type = 'button',
		class: extraClass = '',
		children,
		...rest
	}: Props = $props();
</script>

<button {type} class="{buttonClass(variant, size)} {extraClass}" {...rest}>
	{@render children()}
</button>
