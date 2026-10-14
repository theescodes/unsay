import { describe, expect, it } from 'vitest';

import { transformShadowCss } from './shadow-css';

// Shape copied from Tailwind 4.3's real output for the panel (.output/.../claude.css).
const tailwindOutput = `@layer properties;
@layer theme, base, components, utilities;
@layer properties {
  @supports (((-webkit-hyphens: none)) and (not (margin-trim: inline))) or ((-moz-orient: inline) and (not (color: rgb(from red r g b)))) {
    *, :before, :after, ::backdrop {
      --tw-shadow: 0 0 #0000;
      --tw-ring-offset-width: 0px;
    }
  }
}
@layer theme {
  :root, :host {
    --spacing: .25rem;
    --text-sm: .875rem;
  }
}
.w-\\[min\\(92vw\\,32rem\\)\\] {
  width: min(92vw, 32rem);
}
@media (width >= 40rem) {
  .sm\\:p-8 {
    padding: calc(var(--spacing) * 8);
  }
}
@property --tw-shadow {
  syntax: "*";
  inherits: false;
  initial-value: 0 0 #0000;
}`;

describe('transformShadowCss', () => {
	const out = transformShadowCss(tailwindOutput);

	it('applies the --tw-* fallback unconditionally, including on :host', () => {
		expect(out).not.toContain('@supports (((-webkit-hyphens');
		expect(out).toMatch(
			/@layer properties \{\s*:host, \*, :before, :after, ::backdrop \{\s*--tw-shadow: 0 0 #0000;/
		);
	});

	it('leaves the layer order statements alone', () => {
		expect(out).toContain('@layer properties;');
		expect(out).toContain('@layer theme, base, components, utilities;');
	});

	it('converts rem to px in declarations, custom properties included', () => {
		expect(out).toContain('--spacing: 4px;');
		expect(out).toContain('--text-sm: 14px;');
		expect(out).toContain('width: min(92vw, 512px);');
	});

	it('keeps rem in media queries, where it means the browser default size', () => {
		expect(out).toContain('@media (width >= 40rem)');
	});

	it('does not touch unrelated @supports blocks or @property rules', () => {
		const css = `@supports (color: color-mix(in lab, red, red)) { .a { color: red; } }`;
		expect(transformShadowCss(css)).toBe(css);
		expect(out).toContain('@property --tw-shadow');
	});

	it('is idempotent', () => {
		expect(transformShadowCss(out)).toBe(out);
	});
});
