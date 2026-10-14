---
name: bits-ui
description: Bits UI (headless Svelte component library) docs lookup. Use whenever creating, editing, or debugging a .svelte file that imports from `bits-ui`, or when the user asks about a bits-ui component (Accordion, Dialog, Combobox, Select, Calendar, DatePicker, DropdownMenu, ToggleGroup, Tooltip, etc.) or is choosing between them.
---

# Bits UI docs lookup

Bits UI publishes its docs for LLMs, one plain-text file per page. Fetch the page you need live — there is no local copy to go stale.

## Find the page

The index lists every docs page (components, utilities, guides) with its URL:

```bash
curl -fsSL https://bits-ui.com/llms.txt
```

Component pages follow one pattern — the component name in kebab-case:

```bash
curl -fsSL https://bits-ui.com/docs/components/<name>/llms.txt
# Select          -> /docs/components/select/llms.txt
# AlertDialog     -> /docs/components/alert-dialog/llms.txt
# DateRangePicker -> /docs/components/date-range-picker/llms.txt
```

Use `curl` through Bash, not WebFetch: WebFetch hands back a summary, and the exact prop names, data attributes and snippet signatures are the point. Large pages (Select, Combobox, Calendar, DropdownMenu run 1k+ lines) — pipe through `grep -n` / `sed -n` for the part you need instead of reading all of it.

Cross-cutting guides worth knowing: `child-snippet`, `ref`, `state-management`, `styling`, `transitions`, `dates` (all listed in the index, at `https://bits-ui.com/docs/<guide>/llms.txt`).

## Installed version wins

The website documents the latest bits-ui; the repo pins an exact version (`package.json`). When a prop or type matters, confirm it against the installed package, which is the authority for this codebase:

```bash
jq -r .version node_modules/bits-ui/package.json
ls node_modules/bits-ui/dist/bits/<name>/          # e.g. select, toggle-group
grep -rn "<propName>" node_modules/bits-ui/dist/bits/<name>/types.d.ts
```

If the docs describe something the installed types lack, the docs are ahead of the pinned version — use what is installed, and mention the gap.

## Pairing with the Svelte MCP

This skill covers the bits-ui API surface. For idiomatic Svelte 5 around those components (runes, snippets, effects), use the Svelte plugin (enabled in `.claude/settings.json`): its MCP server, the `svelte-core-bestpractices` skill and the `svelte-file-editor` subagent.
