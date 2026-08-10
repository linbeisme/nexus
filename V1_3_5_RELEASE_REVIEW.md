# v1.3.5 Release Review — Section 3 Template Download Hotfix

**Review date:** 2026-08-10  
**Application:** State Sales Tax Nexus Requirements App  
**Release:** v1.3.5  
**Scope:** Section 3 XLSX/CSV transaction-template download defect only

## Defect reproduced from user evidence

The reported browser download entry showed `Nexus_Transaction_Threshold_Monitor_Simplified.xlsx` with **“File wasn’t available on site.”** In v1.3.4, Section 3 used direct static links to `./templates/Nexus_Transaction_Threshold_Monitor_Simplified.xlsx` and `.csv`. If a GitHub Pages deployment omitted the `templates/` directory, the UI still loaded and the prior test suite could pass, but clicking either link returned a missing-file response.

## Root cause

This was a deployment-coupling defect, not a workbook-format defect. The packaged XLSX is a valid Office Open XML ZIP file and the packaged CSV contains the expected six-column header. The current deployment workflow also copies `templates/`, but the user-facing controls were unnecessarily dependent on that static path being present in the published artifact.

## Remediation

1. Replaced the two static download anchors with explicit buttons.
2. Embedded the exact approved XLSX template bytes in `assets/app.js`.
3. Generate the approved CSV template directly from browser memory.
4. Both downloads now use browser-created Blob URLs and therefore do not require a request to `/templates/...`.
5. Kept the repository `templates/` files and Pages copy step as a redundant recovery/reference copy.
6. Added `tests/template-download-smoke.mjs` and made it a deployment gate.

## Independent verification

The release was tested from the repository root with:

```text
node scripts/validate-data.mjs
node scripts/audit-data.mjs
node --check assets/app.js
node tests/transaction-analysis-smoke.mjs
node tests/measurement-reference-smoke.mjs
python3 tests/ui-static-audit.py
node tests/export-smoke.mjs /tmp/nexus-export-v135.xlsx
node tests/template-download-smoke.mjs
```

Results:

- Dataset validation: PASS — 51 jurisdictions, schema v5, app v1.3.5.
- Independent rules reconciliation: PASS — 51 jurisdictions, 17 transaction-prong, 30 dollar-only.
- JavaScript syntax: PASS.
- Transaction-analysis smoke: PASS.
- Measurement-reference smoke: PASS.
- Static UI audit: **190 PASS / 0 FAIL**.
- General nexus XLSX export smoke: PASS — generated XLSX/ZIP package.
- Section 3 template download smoke: PASS — runtime XLSX Blob is exactly 24,756 bytes and byte-for-byte identical to the packaged XLSX; runtime CSV Blob is exactly 83 bytes and identical to the packaged CSV; test prohibits any static `fetch` dependency.

## Change isolation

`data/state-nexus.json` differs from v1.3.4 only in the top-level `app_version` value (`1.3.4` → `1.3.5`). No jurisdiction threshold, transaction test, measurement period, sales scope, timing rule, source URL, or review conclusion was changed by this hotfix.

## Release assessment

**PASS for deployment.** The reported Section 3 failure mode is removed from the user-facing download path. A missing `templates/` folder in the deployed Pages artifact can no longer cause the two Section 3 template buttons to fail. The retained static copies remain useful for repository inspection and recovery, but are no longer a runtime dependency for these downloads.
