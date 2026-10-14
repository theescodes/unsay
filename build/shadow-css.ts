import postcss, { type Root } from 'postcss';
import type { Plugin } from 'vite';

/**
 * The panel's CSS runs inside a shadow root on claude.ai, and two things Tailwind 4 assumes
 * about a normal page don't hold there:
 *
 * 1. Chrome ignores `@property` rules inside shadow trees, so the `--tw-*` variables behind
 *    shadow-*, ring-*, translate-* and friends get no initial value, and every declaration
 *    composing them is invalid (no shadow, no ring, no transform). Tailwind already ships a
 *    fallback for browsers without `@property` — the `@layer properties` block — but guards it
 *    with an `@supports` that only matches old Safari and Firefox. We drop the guard and add
 *    `:host` to its selector.
 * 2. `rem` resolves against claude.ai's `<html>` font size, not ours, so the panel would scale
 *    with whatever claude.ai sets. Declarations are converted to px at 16px per rem. Media
 *    queries keep rem: there it means the browser's default size, not the page's.
 */
export function transformShadowCss(css: string): string {
	const root = postcss.parse(css);
	unwrapPropertiesFallback(root);
	remToPx(root);
	return root.toString();
}

function unwrapPropertiesFallback(root: Root) {
	root.walkAtRules('layer', (layer) => {
		// Skip the `@layer properties, theme, base;` order statement: it has no body.
		if (layer.params !== 'properties' || !layer.nodes) return;
		layer.walkAtRules('supports', (supports) => {
			supports.replaceWith(supports.nodes ?? []);
		});
		layer.walkRules((rule) => {
			if (!rule.selectors.includes(':host')) rule.selectors = [':host', ...rule.selectors];
		});
	});
}

const REM = /(-?\d*\.?\d+)rem\b/g;

function remToPx(root: Root) {
	root.walkDecls((decl) => {
		if (!decl.value.includes('rem')) return;
		decl.value = decl.value.replace(REM, (_match, value: string) => `${Number(value) * 16}px`);
	});
}

/** Applies {@link transformShadowCss} to every stylesheet the build emits. */
export function shadowCss(): Plugin {
	return {
		name: 'unsay:shadow-css',
		enforce: 'post',
		generateBundle(_options, bundle) {
			for (const file of Object.values(bundle)) {
				if (file.type !== 'asset' || !file.fileName.endsWith('.css')) continue;
				const css =
					typeof file.source === 'string' ? file.source : new TextDecoder().decode(file.source);
				file.source = transformShadowCss(css);
			}
		}
	};
}
