# User Setup Guide — GitHub Browser Only — v1.3.5

## 1. Repository placement

Upload the project contents to the repository root. Keep `.github/workflows/` intact and keep `index.html` at the repository root.

## 2. GitHub Pages

Open **Settings → Pages → Source → GitHub Actions**. Commits to `main` run **Deploy GitHub Pages**.

## 3. Browser-only v1.3.5 update

1. Download and unzip the v1.3.5 package.
2. On macOS, press **Command + Shift + .** if needed so `.github` is visible.
3. Open the GitHub repository root → **Add file → Upload files**.
4. Drag the **contents** of the package, not the enclosing ZIP/folder.
5. Preserve paths such as `assets/app.js`, `data/state-nexus.json`, `scripts/audit-data.mjs`, `tests/measurement-reference-smoke.mjs`, `tests/transaction-analysis-smoke.mjs`, and `.github/workflows/deploy.yml`.
6. Commit to a review branch or `main` according to your governance process.
7. Open **Actions → Deploy GitHub Pages** and require a green `build` and `deploy`.
8. Hard refresh the live site (`Command + Shift + R` on macOS).

## 4. v1.3.5 acceptance test

Confirm all of the following:

- Version **1.3.5** / schema **v5** loads.
- Four work areas are visible, including **Sales/Transaction Economic-Nexus Early Warning**.
- **Measurement Period Determination** shows 51 jurisdictions.
- Measurement method filtering works, including **Quarter-based methods**.
- Changing **Example as of** updates modeled periods.
- Sorting by **Measurement method, then state** works.
- Measurement-period `i` dialogs still open in the State Thresholds table.
- Simplified XLSX/CSV template downloads work even if the deployed Pages artifact is missing the `templates/` directory (the v1.3.5 buttons create browser Blob downloads).
- A sample transaction import produces Review / Watch / Below modeled economic-nexus threshold results.
- Duplicate state/document rows consolidate as designed.
- Incomplete coverage can force Review.
- A below-modeled-threshold result visibly states that it is not an all-clear.
- Research/Update controls still work.
- State and transaction-analysis Excel exports work.

## 5. Deployment controls

The build now executes:

1. `node scripts/validate-data.mjs`
2. `node scripts/audit-data.mjs`
3. `node --check assets/app.js`
4. `node tests/transaction-analysis-smoke.mjs`
5. `node tests/measurement-reference-smoke.mjs`
6. `python3 tests/ui-static-audit.py`
7. `node tests/export-smoke.mjs ...`
8. `node tests/template-download-smoke.mjs`

Do not bypass a red build. A failed legal-data regression control must be reconciled to documented authority rather than weakened to make deployment pass.

## 6. Routine tax-data update

After current primary-source research and approval in the app:

1. Download replacement `state-nexus.json` and `update-history.json`.
2. Upload them to `data/` and `updates/` respectively.
3. For a material legal change, update the locked expectations in `scripts/audit-data.mjs` only after documenting the authority and effective date.
4. Prefer a Pull Request for material changes.
5. Confirm all Actions checks pass.
6. Verify the changed live state row, Measurement Period Determination row, source link, info dialog, transaction screen, and export.

## 7. Rollback

If deployment fails after a change, revert the commit/PR that changed the application or dataset, rerun Actions, and investigate the failed validation before republishing.
