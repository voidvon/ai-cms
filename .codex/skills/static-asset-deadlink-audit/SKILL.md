---
name: static-asset-deadlink-audit
description: Audit dead static asset links in this CMS project's generated site output under ./html, using the real runtime path mappings for shared assets, uploads compatibility, and content/public roots. Use when Codex needs to analyze broken CSS, JS, image, font, PDF, pagefind, or upload asset references in generated HTML/CSS files without inventing a second path-resolution algorithm.
---

# Static Asset Deadlink Audit

Run the bundled auditor instead of inventing a new checker.

## Quick start

From the repository root, run:

```bash
node .codex/skills/static-asset-deadlink-audit/scripts/audit-static-assets.mjs
```

This default run ignores `/pdfs/` references.

Target a different output root only when the user explicitly asks:

```bash
node .codex/skills/static-asset-deadlink-audit/scripts/audit-static-assets.mjs ./html
```

Include `/pdfs/` references only when the user explicitly asks:

```bash
node .codex/skills/static-asset-deadlink-audit/scripts/audit-static-assets.mjs ./html --include-pdfs
```

## Workflow

1. Treat the task as a `静态生成` and `兼容层` audit.
2. Audit generated output under `./html`; do not patch generated files unless the user explicitly requests that.
3. Resolve asset URLs with the same rules used by `system/server/src/static-file-handler.mjs`.
4. Report missing assets with:
   - source file
   - source line
   - original reference
   - resolved request path
   - runtime candidate paths that were tried
5. If the user asks for fixes, change templates, static build logic, or runtime mapping code instead of bulk-editing `html/`.

## Scope

Audit:

- HTML attributes such as `src`, `href`, `poster`, `data-src`, `data-href`
- `srcset`
- inline `style`
- `<style>` blocks
- CSS `url(...)`
- CSS `@import`

Ignore:

- external `http:`, `https:`, protocol-relative URLs
- `data:`, `blob:`, `mailto:`, `tel:`, `javascript:`
- `/pdfs/...` references unless `--include-pdfs` is used
- page links that are not static assets

## Runtime mapping requirements

Read [references/path-mapping.md](references/path-mapping.md) before changing the auditor.

Keep these constraints:

- Reuse content root `html/`, public root `public/`, and shared uploads root `uploads/`
- Reuse shared asset fallback such as `/<section>/assets/... -> /assets/...`
- Reuse upload compatibility such as `/upload/images/... -> /images/...` via the runtime behavior documented in the reference
- Reuse lower-case, capitalized, and trailing-slash candidate expansion from `static-file-handler.mjs`

## Output expectations

Prefer a short summary first:

- scanned files
- discovered asset references
- missing references

Then list the first failing references with enough detail to fix the source template or asset pipeline.

If there are no missing references, say so explicitly and mention any residual gaps, for example if the site relies on runtime-generated assets outside the static roots.
