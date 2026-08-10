# State Sales Tax Nexus Requirements App — v1.3.5

Static GitHub Pages CPA research/workpaper application for remote-seller sales/use-tax economic-nexus screening across all 50 states plus the District of Columbia.

**Post-update independent audit:** 2026-08-09  
**Dataset schema:** v5  
**Independent benchmark:** Sales Tax Institute chart as of 2026-08-01  
**Source-link point-in-time audit:** 51/51 on 2026-08-08  
**Current QA:** dataset PASS; rules reconciliation PASS; transaction smoke PASS; measurement-reference smoke PASS; static UI audit **187 PASS / 0 FAIL**; XLSX export PASS.

## Scope

The app is an **economic-nexus early-warning / watchlist tool**. It identifies states where imported sales activity is approaching, meeting, or may previously have met modeled sales/use-tax economic-nexus thresholds. It is not payroll/income-tax withholding software, a complete nexus determination, or a post-registration filing/remittance instruction system. Physical/affiliate nexus, marketplace facts, taxability, exemptions, related entities, home-rule/local taxes, trailing nexus, and later law changes require separate review. A below-modeled-threshold result is not an all-clear.

## Four work areas

1. **State Economic-Nexus Thresholds** — 51-jurisdiction economic-nexus rules table with source links and measurement-period info dialogs.
2. **Measurement Period Determination** — filter/sort all jurisdictions by audited measurement method and generate date-driven modeled examples using the production measurement engine.
3. **Sales/Transaction Economic-Nexus Early Warning** — import simplified XLSX/CSV transaction data and surface Review, Watch, and below-modeled-threshold states without treating the latter as a no-nexus conclusion.
4. **Research and Update** — source-first research, staged JSON diffs, human approval, and controlled GitHub publication.

## Measurement reference

The new v1.3.1 section supports current/prior calendar year, prior calendar year, rolling 12 months, quarter-based methods, New York four sales-tax quarters, Connecticut September-30 year, Texas preceding 12 completed calendar months, and N/A. A UI-only **Quarter-based methods** group combines Illinois/Missouri quarter-end trailing-12 and New York sales-tax-quarter methods; it does not modify the stored engine code.

No jurisdiction in the current audited dataset uses a standalone “prior quarter only” economic-nexus threshold.

**Fresh-audit correction:** North Carolina's threshold measurement remains current-or-prior calendar year, but its economic-threshold-only compliance timing changed effective 2026-07-02. v1.3.1 updates that timing while preserving immediate/earlier collection review for physical presence or another nexus basis.

## Transaction import

Required fields: Document Date, Document #, Customer, Ship-to State, Sales $ Before Taxes, Customer Type (Retail/Wholesale).

Same ship-to state + document number counts as one transaction under the workpaper convention. Exact duplicate rows are removed from dollars; distinct lines are summed. Reused document numbers across customers, conflicting dates/types, negative sales/credits, incomplete period coverage, and classification sensitivity can force review.

## Documentation index

- `POST_UPDATE_INDEPENDENT_AUDIT.md` — substantive v1.3.0 post-update independent rules audit.
- `V1_3_1_RELEASE_REVIEW.md` — v1.3.1 scope/UX remediation and regression review.
- `INDEPENDENT_RULES_LOGIC_AUDIT.md` — original v1.2.1 51-jurisdiction rules/measurement audit matrix.
- `AUDIT_REPORT.md` — consolidated rules baseline plus v1.3.1 scope/UX QA status.
- `SOURCE_URL_AUDIT.md` — 2026-08-08 point-in-time source URL audit.
- `TECHNICAL_DOCUMENTATION.md` — architecture, schema, engines, QA, deployment.
- `USER_MANUAL.md` — operating instructions.
- `USER_SETUP_GUIDE.md` — GitHub deployment/update instructions.
- `GUIDE.md` / `guide.html` — quick/public guide.
- `V1_3_1_CHANGELOG.md` — v1.3.1 scope/UX hardening changes.
- `V1_3_0_CHANGELOG.md` — prior v1.3.0 measurement-period release changes.
- `updates/update-history.json` — machine-readable audit/change history.

## Local/CI QA

```bash
node scripts/validate-data.mjs
node scripts/audit-data.mjs
node --check assets/app.js
node tests/transaction-analysis-smoke.mjs
node tests/measurement-reference-smoke.mjs
python3 tests/ui-static-audit.py
node tests/export-smoke.mjs /tmp/nexus-export.xlsx
```

The GitHub Pages workflow runs these controls before deployment.

## Governance

Do not auto-publish AI-generated tax conclusions. For material changes, confirm current primary authority, effective date, threshold operator, measurement period/checkpoint, sales scope, transaction definition, marketplace treatment, and collection/registration timing, then publish through a reviewed commit or Pull Request.


## v1.3.2 highlights
- Dark navy section tabs with white text and raised rectangular styling.
- Improved multi-select filter dropdowns, including Select visible / Clear visible controls.
- Measurement Period reference now shows rule effective dates, app last-updated dates, and gold-star markers for recent updates.
- Research prompt strengthened so changes cascade across all dependent sections.


## v1.3.5 highlights
- Fixed Section 3 XLSX and CSV template downloads so they are generated from browser memory instead of depending on a deployed `/templates` URL.
- Added a CI smoke test that confirms the embedded downloads exactly match the packaged template files and that both buttons are wired.
- Retained the packaged `templates/` files and Pages artifact copy as a redundant recovery path.
- Scope and Limitation Disclosure is now an on-demand modal instead of an always-expanded banner.
- Scope and limitations are presented in concise bullet points for faster review.
- No substantive state-rule changes were made.
