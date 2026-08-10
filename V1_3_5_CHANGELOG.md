# v1.3.5 Changelog

- Fixed Section 3 **Download XLSX template** and **Download CSV template** failures observed as “File wasn’t available on site.”
- Replaced static `<a href="./templates/...">` download links with browser-generated download buttons.
- Embedded the exact approved XLSX template bytes in `assets/app.js`; CSV is generated from the approved header string.
- Added `tests/template-download-smoke.mjs` to verify the embedded files match the packaged templates byte-for-byte and both controls are wired.
- Added the new template-download smoke test to the GitHub Pages deployment gate.
- Kept the `templates/` directory in the Pages artifact as a redundant recovery copy.
- No state tax-rule, threshold, measurement-period, or source-authority conclusions were changed in this hotfix.

Release date: 2026-08-10
