# Path Mapping

This auditor must mirror the current runtime behavior instead of inventing a second resolver.

## Static roots

- `public/`: shared public assets such as `public/logo.svg`
- `html/`: generated site output and shared built assets such as `html/assets/...`
- `uploads/`: shared upload buckets exposed through compatibility paths

## Candidate expansion

For a request pathname, the runtime checks these candidates in order:

1. the original pathname
2. shared asset fallback from `/<prefix>/(css|js|skin|upload|uploads|assets)/...` to `/(css|js|skin|upload|uploads|assets)/...`
3. lower-case pathname when the original contains upper-case characters
4. capitalized pathname variant for each segment
5. `index.html` variants when the pathname ends with `/`

The runtime first checks `public/`, then `html/`.

## Shared upload compatibility

The runtime also accepts these request forms and serves them from `uploads/`:

- `/uploads/images/...`
- `/uploads/skin/...`
- `/uploads/pdfs/...`
- `/upload/images/...`
- `/upload/skin/...`
- `/upload/pdfs/...`
- `/skin/...`

Bucket mapping:

- `/uploads/images/...` -> `uploads/images/...`
- `/uploads/skin/...` and `/skin/...` -> `uploads/skin/...`
- `/uploads/pdfs/...` -> `uploads/pdfs/...`

## Audit intent

The skill is for static asset reachability, not page-link validation. Focus on CSS, JS, images, fonts, media, PDFs, JSON, maps, and pagefind/runtime asset bundles referenced by generated HTML or CSS.

Current project default:

- ignore `/pdfs/...` references unless the auditor is run with `--include-pdfs`
