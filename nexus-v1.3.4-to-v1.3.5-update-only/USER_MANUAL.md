# User Manual — State Sales Tax Nexus App v1.3.5

**Audience:** CPA/tax professional/reviewer  
**Coverage:** 50 states plus District of Columbia  
**Documentation date:** 2026-08-09

## 1. What the app answers

The app is a conservative remote-seller **sales/use-tax economic-nexus early-warning and watchlist tool**. It identifies states where imported activity is approaching, meeting, or may previously have met modeled economic-nexus thresholds so a business knows when tax review should begin. It does not prescribe how to register, file, collect, or remit.

The app does **not** determine complete nexus, post-registration sales-tax return frequency or due dates, or the complete compliance process. It also does not replace analysis of physical presence, affiliate/click-through nexus, marketplace arrangements, product/service taxability, exemption documentation, related entities, home-rule/local taxes, special taxes, or trailing nexus. Therefore a below-modeled-threshold result is **not an all-clear**.

## 2. State Economic-Nexus Thresholds

Use the 51-jurisdiction table to review each state's economic-nexus threshold, transaction prong, measurement period, nexus-sales scope, collection/registration timing, marketplace note, change/review dates, and current source URL.

Click the `i` next to **Measurement Period** for an operational explanation and modeled date window.

## 3. Measurement Period Determination

Version 1.3.1 adds a dedicated 51-jurisdiction measurement-period section. It explains **how the threshold lookback is determined**, not the return filing frequency after registration.

### Controls

- **Measurement method** — filter by current/prior calendar year, prior calendar year, rolling 12 months, quarter-based methods, New York sales-tax quarters, Connecticut's September-30 year, Texas's completed-calendar-month method, or no statewide general sales tax.
- **Example as of** — changes the date used to model the example period.
- **Sort** — state A-Z or measurement method then state.
- **Search** — searches state, measurement wording, determination method, threshold wording, and collection/registration timing.
- **Clear measurement filters** — restores all states, state sort, and today's example date.

### Measurement methods

- **Current or prior calendar year (`CY_OR_PRIOR_CY`)** — test current-year activity and the immediately preceding completed calendar year separately. Historical current-year crossings are retained.
- **Prior calendar year (`PRIOR_CY`)** — use the immediately preceding January 1-December 31 year.
- **Rolling 12 months (`ROLLING_12_MONTHS`)** — use a moving 12-month lookback. The screen checks relevant historical transaction-date endpoints so a prior crossing is not erased by later activity.
- **Quarter-end trailing 12 months (`QUARTER_END_TRAILING_12`)** — test at completed calendar-quarter checkpoints using the preceding 12 months.
- **New York four sales-tax quarters (`NY_FOUR_SALES_TAX_QUARTERS`)** — use Mar-May, Jun-Aug, Sep-Nov, and Dec-Feb quarters; both New York threshold prongs must be satisfied.
- **Connecticut September-30 year (`CT_SEP30_YEAR`)** — use the 12 months ending September 30 immediately before the liability period; both Connecticut threshold prongs must be satisfied.
- **Prior 12 completed calendar months (`PRIOR_12_COMPLETE_CAL_MONTHS`)** — use 12 complete months ending with the month before the analysis month.
- **N/A (`NA`)** — no statewide general sales-tax economic-nexus period is modeled.

### Examples of nonstandard methods

For an analysis date of **March 15, 2026**:

- **Minnesota / rolling 12 months:** March 16, 2025 through March 15, 2026.
- **Illinois / quarter-end trailing 12:** the latest completed checkpoint is December 31, 2025, using January 1, 2025 through December 31, 2025; the next checkpoint is March 31, 2026.
- **New York / four sales-tax quarters:** March 1, 2025 through February 28, 2026.
- **Connecticut / September-30 year:** October 1, 2024 through September 30, 2025.
- **Texas / completed calendar months:** March 1, 2025 through February 28, 2026.

The table also shows each state's stored collection/registration/remittance timing. That timing must still be confirmed against current authority before a company starts or stops collection.

## 4. Sales/Transaction Economic-Nexus Early Warning

Download and complete the simplified XLSX or CSV with only:

- Document Date
- Document #
- Customer
- Ship-to State
- Sales $ Before Taxes
- Customer Type (Retail/Wholesale)

Set **Analysis as of** and the actual **Data coverage starts/ends** from the source-system report, then select **Import & analyze**.

### v1.3.5 template download behavior

The Section 3 **Download XLSX template** and **Download CSV template** controls create the approved files directly in the browser. They do not require the live GitHub Pages site to serve a `/templates` path. The packaged repository copies remain synchronized as a reference and recovery control.

### Duplicate convention

Same ship-to state + document number counts as one transaction under the workpaper convention. Exact duplicate rows are removed from dollars; distinct lines under the same document are summed. A document reused for different customers, conflicting dates/types, or negative sales/credits is flagged for review.

### Result statuses

- **Review required — nexus threshold met**
- **Review required — historical threshold crossing detected**
- **Review required — incomplete measurement-period data**
- **Review required — customer classification could change nexus result**
- **Watch**
- **Below modeled economic-nexus threshold — based on imported data**
- **No statewide sales tax**

A Review result means human tax review is required; it does not by itself establish the legal start date. A Watch result is an early-warning signal. A Below modeled economic-nexus threshold result means only that the imported data did not meet the modeled economic-nexus test; it is not a conclusion that the business has no nexus or no sales/use-tax obligation.

## 5. Six-field limitations

The simplified import cannot prove resale/exemption documentation, identify marketplace-facilitated sales, determine line-item taxability, distinguish TPP from services in every state, or test physical/affiliate/related-party/trailing nexus. For taxable-only states, Retail is a screening proxy rather than a taxability conclusion.

If excluded Wholesale dollars could change a retail/taxable threshold result, the current rules engine forces review.

## 6. Transaction-count caution

Unique document count is a management proxy. State law may count orders, invoices, contracts, or another unit. Confirm the legal transaction definition before relying on a transaction-count result.

## 7. Boundary review controls

Two audited boundary inconsistencies remain deliberately conservative:

- **District of Columbia exactly 200 retail sales** → human review.
- **Texas exactly $500,000** → human review.

Do not override these flags without opening current authority.

## 8. Historical crossing

A current below-threshold window does not erase a prior crossing. If the analyzer finds an earlier trigger, investigate the original registration/collection start date, trailing-nexus or termination rules, and current registration status.

## 9. Research and Update

Choose selected states (up to 10), visible rows, or all jurisdictions. Build/copy the source-first prompt, conduct current research, paste JSON into **Stage proposed changes**, review field/source differences, then approve or reject.

Only after qualified review should replacement `state-nexus.json` and `update-history.json` files be committed to GitHub.

## 10. Export

- State table: export filtered or all states to Excel.
- Transaction analysis: export State Review + Normalized Transactions to Excel or download normalized CSV.

## 11. Professional review checklist

Before beginning or ending collection in a state, verify current primary authority for threshold amount/operator, measurement period and checkpoint, transaction unit, includable-sales scope, marketplace treatment, effective date, collection/registration timing, physical/other nexus, taxability/exemptions, trailing nexus/termination rules, and actual return filing frequency/due dates after registration.

Current timing can change independently of the measurement method. For example, North Carolina's measurement remains current-or-prior calendar year, but effective July 2, 2026 a remote seller whose **sole** North Carolina nexus basis is exceeding the economic threshold becomes engaged on the first day of the first calendar month occurring at least 60 days after the threshold is exceeded; other nexus bases can require earlier collection.

See `INDEPENDENT_RULES_LOGIC_AUDIT.md` for the original v1.2.1 51-jurisdiction audit matrix, `POST_UPDATE_INDEPENDENT_AUDIT.md` for the substantive v1.3.0 post-update rules audit, and `V1_3_1_RELEASE_REVIEW.md` for the v1.3.1 scope/UX remediation review.


## Professional-use disclosure
The professional-use scope and limitations are intentionally collapsed in the main interface. Select **Scope and Limitation Disclosure** to open the disclosure in a modal. The disclosure is organized into bullet points covering intended use, non-covered nexus/compliance matters, the non-all-clear meaning of below-threshold results, and the requirement to confirm material conclusions against current primary authority and taxpayer facts.
