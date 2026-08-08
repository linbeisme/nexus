# Independent Audit & UI Review

**Audit date:** 2026-08-07  
**Independent cross-state benchmark date:** 2026-08-01  
**Population:** 50 states plus the District of Columbia (51 jurisdictions)  
**Application schema:** v3

## Executive result

The updated dataset passed structural validation and an independent state-by-state reconciliation of the key economic-nexus benchmark fields used by this application. The reconciliation covers jurisdiction completeness, monetary threshold amount, existence/removal of transaction-count prongs, sales-base classification, material recent transaction-threshold repeal dates, review metadata, and source-link completeness.

Automated results after the update:

- **51 / 51** unique jurisdictions present.
- **30** jurisdictions have a dollar-sales threshold with **no transaction-count prong** and therefore appear when **Sales $ threshold only** is enabled.
- **17** jurisdictions retain a transaction-count component in the benchmark used for this audit.
- **4** jurisdictions have no statewide general sales tax in the dataset (Delaware, Montana, New Hampshire, Oregon); Alaska is separately identified as a local-sales-tax regime using the Alaska Remote Seller Sales Tax Commission framework.
- Sales-scope classifications: **29 all/gross** (27 general gross + 2 gross sales of TPP), **12 retail-only**, **6 taxable-only**, and **4 no statewide sales tax**.
- All rows contain a working-paper review date and a primary-authority URL.

## Source hierarchy and methodology

The all-jurisdiction reconciliation was performed against the Sales Tax Institute **Economic Nexus State by State Chart**, which states that it is current as of **August 1, 2026**. That chart defines its sales-base terminology as follows: gross sales includes resale, taxable and exempt sales; retail sales excludes sales for resale; taxable sales excludes nontaxable sales.

Benchmark:  
https://www.salestaxinstitute.com/resources/economic-nexus-state-guide

Primary state authority was used to resolve or confirm material recent changes and discrepancies, with primary authority taking precedence over a secondary chart. Representative material-change checks included:

- Illinois Department of Revenue: 200-transaction test removed effective January 1, 2026.  
  https://tax.illinois.gov/research/publications/bulletins/fy-2026-12.html
- Kentucky Legislative Research Commission, HB 757 (2026): deletion of the remote-retailer / marketplace transaction-count nexus standard.  
  https://apps.legislature.ky.gov/record/26rs/hb757.html
- Alaska Remote Seller Sales Tax Commission: $100,000 statewide gross-sales threshold; 200-transaction threshold removed effective January 1, 2025; marketplace-facilitated statewide gross sales are included in the threshold.  
  https://arsstc.org/business-sellers/
- North Dakota Office of State Tax Commissioner: only the $100,000 taxable-sales threshold remains; the 200-transaction test was repealed effective July 1, 2019.  
  https://www.tax.nd.gov/sites/www/files/documents/newsletters/june-2019-sales-tax-newsletter.pdf

Each table row also retains its state-specific source URL so the published workpaper can be traced back to primary authority.

## Corrections and enhancements made during this audit

1. Added `nexus_sales_scope` for every jurisdiction using four legally more useful classifications:
   - **All / gross sales**
   - **Retail sales only (excludes resale)**
   - **Taxable sales only**
   - **No statewide sales tax**
   - California and New York are specifically labeled **All / gross sales of TPP**.
2. Added the **Sales $ threshold only** toggle. It selects jurisdictions that have a monetary threshold and no current transaction-count prong; it excludes jurisdictions with no statewide threshold.
3. Corrected/clarified Alaska to reflect that marketplace-facilitated sales are included in the statewide $100,000 gross-sales threshold and replaced the source with the ARSSTC seller guidance.
4. Clarified current sales-base wording for several rows where the distinction between gross, retail, or taxable sales is material.
5. Retained North Dakota's transaction-test repeal date of **July 1, 2019** based on the state Tax Commissioner's contemporaneous primary authority, rather than a conflicting secondary-chart footnote.
6. Added missing deployment support files (`assets/styles.css`, `scripts/validate-data.mjs`, and `.nojekyll`) that were referenced by the prior package but not included.
7. Added deployment quality gates so malformed datasets, benchmark regressions, or JavaScript syntax errors block GitHub Pages publication.
8. Confirmed Excel export uses the application’s actual XLSX writer and includes the new scope field and primary source column.

## Terminology note: “retail” is not the same as “consumer-only”

The requested distinction was phrased as “all sales or retail sales to consumer only.” The application intentionally labels this category **Retail sales only (excludes resale)**. In sales-tax usage, a retail sale generally means a sale other than a sale for resale; the purchaser can be a business end user. Calling it “consumer-only” could incorrectly imply that B2B end-use sales never count.

## UI / usability evaluation

### Passed static UI audit

`tests/ui-static-audit.py` passed **71 checks**, including:

- all required controls and unique DOM IDs;
- JavaScript-to-DOM event target completeness;
- new dollar-threshold toggle and visible label;
- global search and per-column filter row;
- new nexus-sales-scope column;
- separate filtered-table and all-state Excel export controls;
- horizontal scrolling for the wide professional workpaper table;
- sticky column headers and sticky state/jurisdiction column;
- keyboard `:focus-visible` treatment;
- responsive tablet and phone breakpoints;
- full-width toolbar controls on small screens;
- expected data-driven counts (51 total, 30 dollar-only, 17 transaction-prong).

### Excel export test

`tests/export-smoke.mjs` executes the application's **actual** dependency-free XLSX export function. The generated workbook was inspected as an Open XML ZIP package and passed these checks:

- valid XLSX package structure;
- **51 data rows** plus header;
- **Nexus threshold sales scope** column included;
- **Primary source** column included;
- frozen header row;
- Excel AutoFilter present.

### User-friendliness assessment

**Strengths**

- The new toggle makes the common “dollar threshold only” research question a one-click operation.
- Global search plus per-column filters support both broad and precise research.
- Sticky headers and the sticky state column preserve context while reviewing a very wide table.
- The scope legend explains the difference among gross, retail, and taxable sales before users interpret the classification.
- Filtered export and all-state export are separate buttons, reducing ambiguity about what will be downloaded.
- The update workflow separates staged research from approved data, which is appropriate for a CPA workpaper.

**Usability constraint**

The application necessarily presents a large number of fields. On phones, horizontal scrolling remains necessary even though the controls stack responsively. This is preferable to hiding legally relevant columns, but desktop/tablet use is recommended for substantive review.

### Browser automation limitation in this audit environment

A dynamic Chromium click-through test was attempted. The managed execution environment blocks navigation to local/file URLs with `net::ERR_BLOCKED_BY_ADMINISTRATOR`, so a complete browser interaction run could not be truthfully certified here. The project therefore includes `tests/ui-browser-smoke.py` for execution in a normal local or GitHub CI environment where localhost navigation is permitted. This limitation is environmental, not an observed application error.

## Commands used for release QA

```bash
node scripts/validate-data.mjs
node scripts/audit-data.mjs
node --check assets/app.js
python3 tests/ui-static-audit.py
node tests/export-smoke.mjs /tmp/nexus-export.xlsx
```

## Professional limitation

This audit is a research-quality control over the economic-nexus reference dataset, not a legal opinion or a substitute for state-specific analysis. Physical presence, affiliate/click-through nexus, marketplace-facilitator rules, product/service taxability, exemptions, home-rule/local taxes, trailing nexus, and other special rules may create collection obligations independently of the economic-nexus threshold summarized here. State webpages can also lag enacted legislation, so recent statutory changes should be traced to enacted authority before a filing position is finalized.
