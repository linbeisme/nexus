# Beginner Setup & Update Quick Guide — v1.3.5

## Four work areas

1. **State Economic-Nexus Thresholds** — economic-nexus registration/collection screening; not return filing-frequency logic.
2. **Measurement Period Determination** — filter/sort all states by measurement method and see date-driven examples.
3. **Sales/Transaction Economic-Nexus Early Warning** — six-field transaction import with audited measurement engines.
4. **Research and Update** — source-first change research, staged review, and controlled publishing.

## Measurement workflow

```text
Open Measurement Period Determination
→ choose a measurement method or Quarter-based methods
→ set Example as of date
→ review how period is determined
→ review modeled period and threshold test
→ open primary source
→ confirm collection/registration/remittance timing
```

## Transaction workflow

```text
Download template (v1.3.5 browser-generated XLSX/CSV)
→ populate 6 required fields
→ import XLSX/CSV
→ set analysis date + true data coverage
→ analyze state measurement windows
→ review duplicate/proxy/data warnings
→ open primary source
→ determine registration/collection timing
→ export workpaper
```

The app preserves historical threshold crossings and will not issue a below-modeled-threshold result when the current applicable measurement windows are incompletely covered. A **Below modeled economic-nexus threshold — based on imported data** result is not an all-clear for physical/other nexus or facts outside the six-field import.

## Human-review triggers

Historical crossing; incomplete coverage; reused document numbers; conflicting dates/types; negative sales/credits; customer classification sensitivity; D.C. exact 200; Texas exact $500,000; taxable-only/TPP-only data limitations.

See `POST_UPDATE_INDEPENDENT_AUDIT.md` for the substantive v1.3.0 rules audit and `V1_3_1_RELEASE_REVIEW.md` for the v1.3.1 scope/UX remediation review before client reliance.

## v1.3.5 template-download note

Section 3 template buttons create the approved XLSX/CSV directly in the browser. The user-facing download no longer depends on a published `/templates` URL; the repository templates remain as synchronized reference/recovery copies.
