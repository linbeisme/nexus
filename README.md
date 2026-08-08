# State Sales Tax Nexus Requirements App

Static GitHub Pages application for CPA research on remote-seller sales/use tax economic-nexus collection and remittance requirements for all 50 states plus the District of Columbia.

## What the app does

- Displays 51 jurisdictions in a filterable table.
- Provides a keyword filter for every substantive column plus a global search.
- Includes a **Sales $ threshold only** toggle that shows jurisdictions with a dollar-sales threshold and no transaction-count prong.
- Shows economic-nexus thresholds, transaction tests, measurement periods, a separate **nexus threshold sales scope** classification (gross/all, retail-only, taxable-only, or no statewide sales tax), detailed sales included, collection/registration timing, marketplace notes, rule-effective dates, latest material-change dates, review dates, notes, and primary-source URLs.
- Computes a working-paper status of **Current**, **Review due**, or **Proposed change**.
- Builds source-first research prompts for selected jurisdictions.
- Opens state-specific official-domain web searches for change research.
- Stages JSON research results as reviewable field-level diffs instead of silently overwriting the published dataset.
- Records approved changes in local update history.
- Exports either the filtered table or all 51 jurisdictions to a true `.xlsx` workbook in the browser. The export includes the nexus sales-scope field and cited source information.
- Downloads replacement `data/state-nexus.json` and `updates/update-history.json` files for a reviewed GitHub commit.

## Repository layout

```text
.
├── index.html
├── assets/
│   ├── app.js
│   └── styles.css
├── data/
│   └── state-nexus.json
├── updates/
│   └── update-history.json
├── scripts/
│   ├── validate-data.mjs
│   └── audit-data.mjs
├── .github/
│   └── workflows/
│       ├── deploy.yml
│       └── nexus-review.yml
├── tests/
│   ├── ui-static-audit.py
│   ├── export-smoke.mjs
│   └── ui-browser-smoke.py
├── AUDIT_REPORT.md
└── .nojekyll
```

## Publish with GitHub Pages

1. Create a GitHub repository and copy this project into the repository root.
2. Commit and push to the `main` branch.
3. In GitHub, open **Settings → Pages**.
4. Under **Build and deployment → Source**, choose **GitHub Actions**.
5. Open the **Actions** tab and confirm that **Deploy GitHub Pages** completes successfully.
6. The deployment job exposes the published Pages URL.

The deployment workflow validates the dataset, runs the independent reconciliation regression checks, syntax-checks the application JavaScript, builds a small static `_site` artifact, uploads it, and deploys it to the `github-pages` environment.

## Local testing

Because the app fetches JSON, do not test it by double-clicking `index.html` under `file://`. Serve the repository over HTTP instead:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/`.

You can validate the dataset, independently reconcile the key benchmark fields, audit the UI wiring/responsiveness, and exercise the actual XLSX export code without a browser:

```bash
node scripts/validate-data.mjs
node scripts/audit-data.mjs
python3 tests/ui-static-audit.py
node tests/export-smoke.mjs /tmp/nexus-export.xlsx
```

An optional headless-Chromium interaction test is also included for a normal local/CI environment that permits navigation to `localhost`:

```bash
pip install websocket-client
python3 tests/ui-browser-smoke.py
```

The browser smoke test is supplemental. The static audit verifies control presence, labels, JavaScript-to-DOM wiring, responsive/sticky table behavior, the new toggle, filters, and data-driven row counts. The XLSX smoke test executes the application's own dependency-free export function.

## Review and update process

1. Filter to the state(s) being reviewed or choose all jurisdictions.
2. Click **Build prompt** and use the prompt in your approved research tool/workflow.
3. Prefer primary authority: enacted legislation, statutes, regulations, state tax-agency notices, FAQs, and official pages.
4. Paste the returned JSON array into **Stage proposed changes**.
5. Review each field-level diff and open the cited source.
6. Approve only supported changes. Rejected proposals never alter the working copy.
7. Click **Download updated JSON** and **Download update history**.
8. Replace `data/state-nexus.json` and `updates/update-history.json` in the repository.
9. Commit through a reviewed pull request or reviewed direct commit. The Pages workflow republishes the new dataset.

### Important browser-storage behavior

Working-copy edits and staged proposals are stored in that browser's `localStorage`. They are **not** authoritative and do not modify GitHub. When the published dataset's `last_full_review` changes, stale browser working-copy data is discarded so an older local copy does not mask a newly published baseline.

## Monthly review reminder

`.github/workflows/nexus-review.yml` runs on the first day of each month at 15:00 UTC and can also be run manually. It creates a GitHub issue with the current review metadata and any jurisdictions past the configured review-due interval. It deliberately does **not** auto-edit tax rules.

Change the cron schedule in that workflow if your firm uses a different review cadence.

## Data fields

Each jurisdiction includes:

- `state`
- `status`
- `threshold`
- `transaction_test`
- `measurement_period`
- `nexus_sales_scope`
- `sales_basis`
- `collection_timing`
- `marketplace_note`
- `rule_effective_date`
- `latest_change_date`
- `last_reviewed`
- `source_title`
- `source_url`
- `notes`

`last_reviewed` is internal working-paper metadata. It should not be presented as the date the state agency published or updated its webpage. `latest_change_date` is the working-paper date of the latest material rule change identified for that jurisdiction.

The `nexus_sales_scope` classification deliberately uses **Retail sales only (excludes resale)** rather than “consumer-only.” A retail sale is generally a sale other than for resale and can include sales to business end users; it is not limited to individual consumers.

## Security and governance

- Do **not** place API keys, GitHub personal access tokens, or other secrets in `index.html`, `assets/app.js`, or JSON files. GitHub Pages content is delivered to browsers and should be treated as public client-side code/data.
- If a future automated research job uses a paid API, keep the credential in GitHub Actions **Secrets** and make that workflow produce a proposed report or pull request for human review rather than directly changing tax conclusions.
- Use branch protection and pull-request approval if this app supports client work or filing decisions.

## Professional-use limitation

This project is a research aid, not legal advice. Economic-nexus thresholds are only one potential basis for seller registration and collection obligations. Physical presence, affiliates, click-through activity, marketplaces, local/home-rule taxes, product-specific rules, exemptions, and special taxes require separate analysis.


## Audit record

See `AUDIT_REPORT.md` for the latest data-reconciliation methodology, corrections, source hierarchy, and UI test results. The audit is a research-quality control and does not replace state-specific legal analysis for a filing position.

## Beginner illustrated guide

A click-by-click GitHub Pages setup and controlled tax-data update manual is included at [`guide.html`](./guide.html), with app screenshots, workflow diagrams, charts, troubleshooting, and worked Illinois/Kentucky update examples. The live Pages site publishes the same guide alongside the app.
