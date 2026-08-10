# Technical Documentation — State Sales Tax Nexus App v1.3.5

**Documentation revision:** 2026-08-09  
**Application version:** 1.3.5  
**Dataset schema:** v5  
**Coverage:** 50 states plus District of Columbia (51 jurisdictions)

## 1. Purpose and scope

The application is a static, client-side GitHub Pages **sales/use-tax economic-nexus early-warning and watchlist workpaper** for remote sellers. It is not a payroll/income-tax withholding system, a complete nexus determination, or a sales-tax return filing-frequency/due-date engine.

Economic nexus is only one registration/collection trigger. Physical presence, affiliate/click-through nexus, related entities, marketplace arrangements, product/service taxability, exemptions, home-rule/local taxes, trailing nexus, and special taxes remain outside the automated screen. Accordingly, `below` is a workflow category—not an all-clear conclusion.

## 2. Architecture

```text
Browser
  ├─ index.html
  ├─ assets/app.js
  ├─ assets/styles.css
  ├─ assets/favicon.svg
  ├─ data/state-nexus.json
  ├─ templates/*.xlsx / *.csv
  └─ guide.html

Repository / CI
  ├─ scripts/validate-data.mjs
  ├─ scripts/audit-data.mjs
  ├─ tests/ui-static-audit.py
  ├─ tests/transaction-analysis-smoke.mjs
  ├─ tests/measurement-reference-smoke.mjs
  ├─ tests/export-smoke.mjs
  └─ .github/workflows/
       ├─ deploy.yml
       └─ nexus-review.yml
```

Transaction files are processed in the browser and are not automatically written to GitHub.

## 3. Workspace sections

1. **State Economic-Nexus Thresholds** — published 51-jurisdiction rule table. “Filing” means economic-nexus registration/collection/remittance review, not return frequency.
2. **Measurement Period Determination** — 51-jurisdiction measurement-method reference with filter, date-driven examples, sorting, threshold summary, operational timing, and source link.
3. **Sales/Transaction Economic-Nexus Early Warning** — six-field transaction import and conservative nexus screening.
4. **Research and Update** — prompt generation, staged field-level proposals, human review, and replacement JSON downloads.

## 4. Schema v5 rules model

The v1.3.1 release intentionally retains schema v5. It does not change the substantive 51-jurisdiction rule model; it hardens product scope and result semantics on top of the audited v1.3.0 engine.

Key engine fields per jurisdiction:

- `measurement_code`
- `dollar_threshold_amount`
- `dollar_threshold_operator`
- `transaction_threshold_count`
- `transaction_threshold_operator`
- `threshold_logic`
- `transaction_scope`
- `logic_audit_date`
- optional `dollar_review_floor`
- optional `transaction_review_floor`

Top-level metadata now also includes `post_update_audit_date` and `post_update_audit_status`.

## 5. Measurement engine map

Supported codes:

- `CY_OR_PRIOR_CY` — current calendar year plus prior completed calendar year.
- `PRIOR_CY` — immediately prior completed calendar year.
- `ROLLING_12_MONTHS` — trailing 12 months evaluated at relevant endpoints.
- `QUARTER_END_TRAILING_12` — preceding 12 months at calendar-quarter checkpoints.
- `NY_FOUR_SALES_TAX_QUARTERS` — immediately preceding four New York sales-tax quarters.
- `CT_SEP30_YEAR` — 12-month period ending September 30 immediately preceding the liability period.
- `PRIOR_12_COMPLETE_CAL_MONTHS` — preceding 12 completed calendar months.
- `NA` — no statewide general sales-tax economic-nexus screen.

The 51-jurisdiction map remains locked by `scripts/audit-data.mjs`.

## 6. Measurement Period Determination implementation

The section is generated from the authoritative in-app state dataset; no second rules table is maintained.

Core functions:

- `measurementMethodLabel(row)` — converts the engine code to a user-facing method category.
- `measurementDeterminationText(row)` — explains the legal/operational method.
- `measurementExampleText(row, asOf)` — calls the same `getMeasurementWindows()` engine used by transaction analysis and produces a modeled example.
- `measurementFilterMatches(row, value)` — supports exact engine filters plus a quarter-based grouped filter.
- `renderMeasurementReference()` — filters, searches, sorts, and renders all current rows.

This design prevents the explanatory table from drifting away from the transaction engine.

### Quarter-based grouping

`QUARTER_BASED` is a UI-only grouping and is not a dataset engine code. It currently groups:

- `QUARTER_END_TRAILING_12` — Illinois and Missouri.
- `NY_FOUR_SALES_TAX_QUARTERS` — New York.

Connecticut's September-30 fixed year is intentionally not grouped as a generic quarter-based method.

## 7. Audited special measurement controls retained

The post-update audit retained the v1.2.1 corrections and conservative controls and also corrected North Carolina's 2026-07-02 economic-threshold-only compliance timing. Controls include:

- Minnesota — rolling prior 12 months.
- Pennsylvania — prior calendar year; `>= $100,000` structured boundary.
- Vermont — any preceding 12-month period under state-authorized Streamlined guidance.
- Illinois — quarter-end trailing 12 months; transaction test removed effective 2026-01-01.
- Missouri — current DOR operational FAQ quarter-end trailing 12 months; official-source tension remains documented.
- Connecticut — September-30 year and AND logic.
- New York — four sales-tax quarters and AND logic.
- Texas — preceding 12 complete calendar months; exact $500,000 forced to review.
- District of Columbia — `>200` principal transaction operator; exactly 200 forced to review.
- North Dakota — transaction-prong repeal date of 2019-07-01 retained from primary state authority.

## 8. Historical-crossing logic

A current below-threshold window does not erase a prior nexus crossing. The analyzer evaluates historical measurement checkpoints contained in the imported history. A historical trigger returns **Review required — historical threshold crossing detected**.

## 9. Transaction normalization and duplicate controls

Required fields: Document Date, Document #, Customer, Ship-to State, Sales $ Before Taxes, Customer Type.

Grouping key: **ship-to state + document number**.

- exact repeated rows removed from dollars;
- distinct lines under one document summed but remain one transaction;
- reused document numbers across customers force review;
- conflicting dates/types force review;
- negative sales/credit documents force review.

Document count remains a screening proxy for a legal transaction count.

## 10. Sales-scope/proxy controls

- All/gross: Retail + Wholesale screened.
- Retail-only: Retail screened; Wholesale exclusion does not prove resale validity.
- Taxable-only: Retail is a screening proxy/ceiling.
- TPP-only: warning that six-field data does not distinguish services/non-TPP.

If excluded Wholesale dollars could change a retail/taxable result, the state is forced to review.

## 11. Data-coverage control

The user supplies source-report coverage start/end dates. A below-threshold result is suppressed when the imported source period does not cover every currently applicable measurement window.

## 12. Exact-boundary controls

- District of Columbia: exactly 200 retail sales → review.
- Texas: exactly $500,000 → review.

These are explicit `transaction_review_floor` / `dollar_review_floor` controls rather than prose-only warnings.

## 13. Local persistence

Schema-v5 browser keys remain:

```text
salesTaxNexusWorkingV5
salesTaxNexusProposalsV5
salesTaxNexusHistoryV5
salesTaxNexusThemeV1
salesTaxNexusResearchStatesV1
```

A version bump alone does not invalidate the structured working-copy schema.

## 14. Deployment quality gates

`.github/workflows/deploy.yml` runs:

1. dataset validation;
2. independent rules reconciliation;
3. JavaScript syntax check;
4. transaction-analysis smoke;
5. measurement-reference smoke;
6. static UI audit;
7. XLSX export smoke;
8. Pages artifact build/deploy.

A failed gate blocks deployment.

## 15. Post-update QA — 2026-08-09

- Dataset validation: **PASS** — 51 jurisdictions, schema v5, app v1.3.5.
- Independent rules reconciliation: **PASS** — 51 measurement/scope records, 17 transaction-prong, 30 dollar-only.
- JavaScript syntax: **PASS**.
- Transaction-analysis smoke: **PASS**.
- Measurement-reference smoke: **PASS** — 51/51 have mapped method labels, determination text, and examples.
- Static UI audit: **187 PASS / 0 FAIL**.
- XLSX export smoke: **PASS**.

## 16. Result-semantics hardening in v1.3.1

The internal categories remain `review`, `watch`, and `below` for compatibility. User-facing semantics are:

- `review` — a modeled threshold, historical crossing, boundary, data-quality, or proxy condition requires human tax review.
- `watch` — imported activity is approaching a modeled economic-nexus threshold at the configured watch percentage.
- `below` — displayed as **Below modeled economic-nexus threshold — based on imported data**. This is not a no-nexus or no-tax-obligation conclusion and does not test other nexus bases or facts absent from the simplified import.

Exports carry the same user-facing screening result and data/method note so the limitation survives outside the browser UI.

## 17. Governance / no-assurance statement

Regression tests protect the audited model from accidental code/data drift; they do not substitute for new legal research when law changes. A qualified reviewer should open current primary authority before beginning or stopping registration, collection, remittance, or filing.

## v1.3.5 Section 3 template-download control

Section 3 template buttons do not rely on a GitHub Pages file URL. The CSV header and the exact packaged XLSX bytes are embedded in `assets/app.js` and downloaded as browser-created Blob URLs. This prevents a missing Pages artifact path from producing a browser “File wasn’t available on site” error. `tests/template-download-smoke.mjs` verifies that the embedded XLSX/CSV exactly match the files under `templates/`, the buttons exist, and the event handlers are wired. The Pages workflow still copies `templates/` as a redundant packaged copy.
