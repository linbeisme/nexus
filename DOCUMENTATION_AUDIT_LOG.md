# Documentation Audit Log

**Application version:** 1.3.5  
**Dataset schema:** v5  
**Current synchronization date:** 2026-08-10

## 2026-08-10 — v1.3.5 Section 3 template-download hotfix

The Section 3 XLSX/CSV template download defect shown by the browser as **“File wasn’t available on site”** was traced to the UI relying on static `./templates/...` URLs. The repository contained valid template files and the current Pages workflow copied `templates/`, but a deployed repository/artifact missing that directory could still pass the prior validation suite and produce a user-facing 404.

### v1.3.5 remediation

- replaced Section 3 static template anchors with explicit download buttons;
- embedded the exact approved XLSX bytes in `assets/app.js` and generate the CSV from the approved header string;
- downloads now use browser-created Blob URLs and no longer depend on a Pages `/templates` path;
- retained `templates/` in the repository and Pages artifact as a redundant recovery copy;
- added `tests/template-download-smoke.mjs`, which checks byte-for-byte XLSX synchronization, exact CSV synchronization, button presence, and JavaScript event wiring;
- added the new smoke test to the deployment gate;
- no substantive state-rule, threshold, source, measurement-period, or transaction-screening logic was changed.

### v1.3.5 QA at documentation freeze

- Dataset validation: PASS — 51 jurisdictions / schema v5 / app v1.3.5.
- Independent rules reconciliation: PASS — 51 jurisdictions / 17 transaction-prong / 30 dollar-only.
- JavaScript syntax: PASS.
- Transaction-analysis smoke: PASS.
- Measurement-reference smoke: PASS.
- Static UI audit: **190 PASS / 0 FAIL**.
- Nexus XLSX export smoke: PASS.
- Section 3 template-download smoke: PASS — embedded XLSX 24,756 bytes; CSV 83 bytes; embedded/package copies identical.

---

## 2026-08-09 — v1.3.1 scope/UX synchronization

Documentation was synchronized after implementing the external audit recommendation to position the app as an economic-nexus early-warning/watchlist tool and to eliminate the false all-clear implication of the prior low-risk wording.

### v1.3.1 consistency points

- application version 1.3.1 / schema v5;
- primary transaction workspace is **Sales/Transaction Economic-Nexus Early Warning**;
- low-risk user-facing result is **Below modeled economic-nexus threshold — based on imported data**;
- UI, per-state notes, manuals, and exports state that a below result is not an all-clear;
- physical/affiliate nexus, marketplace facts, taxability, exemptions, related entities, local/home-rule obligations, trailing nexus, and other omitted facts remain outside the automated screen;
- substantive 51-jurisdiction state rows, measurement codes, thresholds, operators, and timing rules were not changed in v1.3.1;
- `POST_UPDATE_INDEPENDENT_AUDIT.md` remains the substantive v1.3.0 rules-audit baseline;
- `V1_3_1_RELEASE_REVIEW.md` documents the v1.3.1 scope/UX remediation.

### v1.3.1 QA at documentation freeze

- Dataset validation: PASS — 51 jurisdictions / schema v5 / app v1.3.5.
- Independent rules reconciliation: PASS — 51 jurisdictions / 17 transaction-prong / 30 dollar-only.
- JavaScript syntax: PASS.
- Transaction-analysis smoke: PASS.
- Measurement-reference smoke: PASS.
- Static UI audit: **187 PASS / 0 FAIL**.
- XLSX export smoke: PASS.
- Documentation checksum manifest: PASS at release packaging.
- Release ZIP integrity: PASS at release packaging.

---

## 2026-08-09 — v1.3.0 post-update synchronization

Documentation was synchronized after the new Measurement Period Determination section, the fresh independent rules/logic review, and final QA.

### Documents synchronized

- `README.md`
- `TECHNICAL_DOCUMENTATION.md`
- `USER_MANUAL.md`
- `USER_SETUP_GUIDE.md`
- `GUIDE.md`
- `guide.html`
- `AUDIT_REPORT.md`
- `POST_UPDATE_INDEPENDENT_AUDIT.md`
- `V1_3_0_CHANGELOG.md`
- `INDEPENDENT_RULES_LOGIC_AUDIT.md` (retained as the v1.2.1 baseline matrix)
- `updates/update-history.json`

### Required consistency points

- app version 1.3.0 / schema v5;
- new 51-jurisdiction Measurement Period Determination section uses the production measurement engine rather than duplicating legal rules;
- filtering by actual measurement codes plus a UI-only quarter-based group;
- examples are generated for a user-selected “as of” date;
- structured threshold operators, threshold logic, transaction scope, and measurement codes remain controlling;
- historical measurement-window testing remains active;
- Minnesota/Pennsylvania/Vermont measurement corrections remain active;
- Illinois/Missouri/Connecticut/New York/Texas special engines remain active;
- D.C./Texas exact-boundary human-review controls remain active;
- North Dakota primary-authority repeal date remains 2019-07-01;
- **North Carolina collection timing was newly corrected effective 2026-07-02** for remote sellers whose sole nexus basis is exceeding the economic threshold;
- duplicate/reused document and negative-credit controls remain active;
- retail/wholesale classification sensitivity and six-field taxability/TPP/marketplace limitations remain explicit;
- “State Thresholds for Filing” was defined as nexus screening, not post-registration return filing-frequency logic;
- source URL audit remains separately dated 2026-08-08; targeted current-source re-verification on 2026-08-09 does not falsely re-date all URLs.

### QA at documentation freeze

- Dataset validation: PASS.
- Independent rules reconciliation: PASS.
- JavaScript syntax: PASS.
- Transaction-analysis smoke: PASS.
- Measurement-reference smoke: PASS.
- Static UI audit: 184 PASS / 0 FAIL.
- XLSX export smoke: PASS.

This documentation synchronization does not itself create a legal opinion. The state rows and screening outputs remain subject to current primary-authority review before client reliance.
