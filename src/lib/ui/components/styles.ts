/*
 * Shared style fragments: one button look, so it can't drift between components. Tailwind's
 * scanner picks the class names up from this file. Keyboard focus needs nothing here: style.css
 * outlines every :focus-visible element.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const variantClass: Record<ButtonVariant, string> = {
	primary: 'bg-ink text-bg hover:bg-ink/85',
	secondary: 'border border-line-strong bg-surface text-ink hover:bg-bg2',
	ghost: 'text-muted hover:bg-bg2 hover:text-ink',
	// The orange signal is reserved for the one irreversible action.
	danger: 'bg-signal text-on-signal hover:brightness-95'
};

const sizeClass: Record<ButtonSize, string> = {
	sm: 'px-3 py-1.5 text-sm',
	md: 'px-4 py-2 text-sm'
};

/** Also for links that should look like buttons (the receipt download). */
export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md'): string {
	return `inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variantClass[variant]} ${sizeClass[size]}`;
}
