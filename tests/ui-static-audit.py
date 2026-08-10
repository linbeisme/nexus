#!/usr/bin/env python3
"""Static UI/usability wiring audit for the GitHub Pages app.

This complements (but does not replace) a real browser smoke test. It verifies that
controls, labels, JS bindings, responsive/sticky CSS, filters, and dataset assumptions
needed by the professional workpaper UI are internally complete.
"""
from __future__ import annotations

import json
import pathlib
import re
import sys
from bs4 import BeautifulSoup

ROOT = pathlib.Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
APP = ROOT / "assets" / "app.js"
CSS = ROOT / "assets" / "styles.css"
DATA = ROOT / "data" / "state-nexus.json"

failures: list[str] = []
passes: list[str] = []

def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        passes.append(name)
    else:
        failures.append(f"{name}: {detail}" if detail else name)

html = INDEX.read_text(encoding="utf-8")
js = APP.read_text(encoding="utf-8")
css = CSS.read_text(encoding="utf-8")
dataset = json.loads(DATA.read_text(encoding="utf-8"))
states = dataset["states"]
soup = BeautifulSoup(html, "html.parser")

required_ids = {
    "datasetStamp", "lastFullReview", "nextReview", "reviewDueCount",
    "approvedChangeCount", "proposalCount", "globalSearch", "dollarThresholdOnly",
    "clearFilters", "markReviewed", "exportExcel", "exportAllExcel", "downloadDataset",
    "resetWorkingCopy", "stats", "nexusTable", "headerRow", "filterRow", "tbody",
    "updateScope", "updatePrompt", "buildPrompt", "copyPrompt", "openSearch",
    "jsonPatch", "stagePatch", "clearProposals", "patchStatus", "proposalArea",
    "proposalList", "approveAll", "downloadHistory", "footerMeta", "editDialog",
    "editForm", "editFields", "saveEdit", "themeToggle", "changeAlert",
    "tableScrollTop", "tableScrollTopSpacer", "tableWrap", "statePicker",
    "statePickerControls", "statePickerToggle", "selectedStateSummary",
    "statePickerSearch", "stateSelectionCount", "clearStateSelection", "stateSelectionList",
    "versionBaselineLine", "auditLine", "sourceAuditLine", "clearPrompt",
    "measurementDialog", "measurementTitle", "measurementBody", "transactionFiles",
    "analysisAsOf", "coverageStart", "coverageEnd", "watchPercent", "analyzeTransactions",
    "clearTransactionAnalysis", "exportTransactionAnalysis", "downloadNormalizedCsv",
    "transactionImportStatus", "transactionSummary", "analysisResultsArea", "analysisResultFilter",
    "analysisTable", "analysisTbody", "transactionPreviewBody",
    "measurement-reference", "measurementMethodFilter", "measurementReferenceDate", "measurementSort",
    "measurementSearch", "clearMeasurementFilters", "measurementStats", "measurementReferenceTable", "measurementReferenceBody"
}
ids = [tag.get("id") for tag in soup.find_all(attrs={"id": True})]
for rid in sorted(required_ids):
    check(f"DOM id #{rid} exists once", ids.count(rid) == 1, f"count={ids.count(rid)}")

# JS -> DOM cross-check for static getElementById calls.
js_ids = set(re.findall(r"getElementById\(['\"]([^'\"]+)['\"]\)", js))
missing_from_html = sorted(js_ids - set(ids))
check("Every static JS getElementById target exists", not missing_from_html, str(missing_from_html))

# Requested controls and semantics.
toggle = soup.find(id="dollarThresholdOnly")
check("Sales-dollar-only toggle is a checkbox", bool(toggle and toggle.get("type") == "checkbox"))
label = toggle.find_parent("label") if toggle else None
check("Toggle has a visible explanatory label", bool(label and "Sales $ threshold only" in label.get_text(" ", strip=True)))
check("Filtered Excel export control exists", soup.find(id="exportExcel") is not None)
check("All-state Excel export control exists", soup.find(id="exportAllExcel") is not None)
check("Table has thead and tbody semantics", bool(soup.select_one("#nexusTable thead") and soup.select_one("#nexusTable tbody")))
check("Scope legend explains sales-base categories", "Nexus threshold sales scope" in soup.select_one(".scope-legend").get_text(" ", strip=True))
check("Professional-use limitation is visible", "Professional-use note" in soup.get_text(" ", strip=True))

# App wiring for the requested functions.
check("Scope column wired into table", "['nexus_sales_scope','Nexus threshold sales scope']" in js)
check("Dollar-only predicate exists", "function isDollarThresholdOnly" in js)
check("Toggle participates in visibleRows filtering", "dollarThresholdOnly && !isDollarThresholdOnly" in js)
check("Clear filters resets toggle", "dollarThresholdOnly=false" in js.replace(" ", ""))
check("Filtered XLSX event is wired", "exportXlsx(visibleRows(),'filtered')" in js)
check("All-state XLSX event is wired", "exportXlsx(data,'all_states')" in js)
check("XLSX contains autofilter", "<autoFilter ref=" in js)
check("XLSX freezes header row", 'ySplit="1"' in js)
check("Update prompt requests sales-scope verification", "nexus_sales_scope" in js and "retail" in js.lower() and "taxable" in js.lower())

# CSS usability/readability checks.
compact_css = re.sub(r"\s+", "", css)
check("Table container scrolls", ".table-wrap{overflow:auto" in compact_css)
check("Header is sticky", "th{" in css and "position:sticky" in css)
check("State column is sticky", ".state-cell{position:sticky" in compact_css)
check("Keyboard focus treatment is present", ":focus-visible" in css)
check("Toolbar wraps instead of clipping", ".toolbar-row{display:flex" in compact_css and "flex-wrap:wrap" in compact_css)
check("Tablet responsive breakpoint exists", "@media (max-width:1000px)" in css)
check("Phone responsive breakpoint exists", "@media (max-width:620px)" in css)
check("Phone toolbar controls expand full width", ".toolbar-row>*:not(.stats){width:100%}" in compact_css)


# Version 1.3.3 UX requirements.
check("Version 1.3.3 is configured", "APP_VERSION = '1.3.3'" in js and dataset.get("app_version") == "1.3.3")
check("Money bag favicon is configured", bool(soup.find("link", attrs={"rel": "icon", "href": "./assets/favicon.svg"})))
check("Day/night theme toggle exists", soup.find(id="themeToggle") is not None and "toggleTheme" in js)
check("Night theme CSS exists", 'html[data-theme="night"]' in css)
check("Excel buttons use dedicated dark-green class", all("excel" in (soup.find(id=x).get("class") or []) for x in ["exportExcel","exportAllExcel"]))
check("Input fields use light-yellow background variable", "--input-bg:#fff7c9" in compact_css and "background:var(--input-bg)" in compact_css)
check("Default action buttons use light-purple background variable", "--button-bg:#eee5ff" in compact_css and "background:var(--button-bg)" in compact_css)
check("Table has a synchronized top scrollbar", soup.find(id="tableScrollTop") is not None and "setupTableScrollSync" in js and "syncTableScrollWidth" in js)
check("Guide and result chips share the dedicated status row", bool(soup.select_one(".toolbar-status .guide-link") and soup.select_one(".toolbar-status #stats.inline-stats")))
check("Guide control uses navy styling", ".guide-link{background:#0b2d5c" in compact_css and "color:#fff" in compact_css)
check("Clear prompt control is wired", soup.find(id="clearPrompt") is not None and "getElementById('clearPrompt')" in js)
check("Multi-filter options force left-checkbox/right-label alignment", ".multi-option{display:flex!important" in compact_css and "order:0" in compact_css and "order:1" in compact_css)
check("Material-change siren and state-star logic exists", "changeAlert" in js and "state-change-star" in js and "MATERIAL_CHANGE_KEYS" in js)
check("Research scope supports selected states", bool(soup.select_one('#updateScope option[value="selected"]')) and "selectedResearchStates" in js)
check("Research state selection is capped at 10", "selectedResearchStates.size>=10" in js)
check("Research state selector can collapse", "statePickerExpanded" in js and "toggleStatePicker" in js and soup.find(id="statePickerToggle") is not None)
check("Header metadata is split into three lines", all(soup.find(id=x) is not None for x in ["versionBaselineLine","auditLine","sourceAuditLine"]))
check("Multi-filter popover is viewport-positioned", ".multi-filter-menu{position:fixed" in compact_css and "positionMultiFilterMenu" in js)
check("Only one multi-filter popover stays open", "querySelectorAll('.multi-filter[open]')" in js)
for key in ["state","review_status","status","transaction_test","nexus_sales_scope"]:
    check(f"Multi-criteria filter enabled for {key}", key in re.search(r"MULTI_FILTER_KEYS = new Set\(\[(.*?)\]\)", js, re.S).group(1))
check("Source URL audit metadata is present", dataset.get("source_url_audit_date") == "2026-08-08" and dataset.get("source_url_audit_count") == 51)


# Version 1.3.3 transaction-analysis and independently audited measurement-period requirements.
page_text = soup.get_text(" ", strip=True)
check("State economic-nexus thresholds section exists", "State Economic-Nexus Thresholds" in page_text)
check("Sales/Transaction early-warning section exists", "Sales/Transaction Economic-Nexus Early Warning" in page_text)

check("Measurement Period Determination section exists", "Measurement Period Determination" in page_text)
check("Measurement method filter exists", soup.find(id="measurementMethodFilter") is not None and "QUARTER_BASED" in html)
check("Measurement reference supports example date", soup.find(id="measurementReferenceDate") is not None and "measurementExampleText" in js)
check("Measurement reference supports method sorting", soup.find(id="measurementSort") is not None and "measurementMethodLabel" in js)
check("Measurement reference renders all jurisdictions from dataset", "renderMeasurementReference" in js and "data.filter(r=>measurementFilterMatches" in js)
check("Measurement section distinguishes threshold lookback from filing frequency", "does not determine post-registration return filing frequency or due dates" in page_text)
check("Research and Update section exists", "Research and Update" in page_text)
check("Transaction importer accepts multiple files", bool(soup.find(id="transactionFiles") and soup.find(id="transactionFiles").has_attr("multiple")))
check("XLSX and CSV templates are linked", bool(soup.find("a", href="./templates/Nexus_Transaction_Threshold_Monitor_Simplified.xlsx") and soup.find("a", href="./templates/Nexus_Transaction_Threshold_Monitor_Simplified.csv")))
check("Browser SheetJS import support is referenced", "cdn.sheetjs.com/xlsx-0.20.3" in html)
check("Duplicate document grouping exists", "buildDocumentGroups" in js and "distinct imported row(s) consolidated to one transaction" in js)
check("State transaction analysis uses measurement windows", "getMeasurementWindows" in js and "analyzeState" in js)
check("Measurement-period info dialog is wired", "openMeasurementDialog" in js and "data-measurement-state" in js)
check("Incomplete data coverage can force review", "incomplete measurement-period data" in js.lower())
check("Taxable-only simplified-data limitation is explicit", "Taxable-sales-only threshold" in js)
check("Analysis export control is wired", "exportTransactionAnalysis" in js and "nexus_transaction_analysis_" in js)
check("Normalized transaction export is wired", "downloadNormalizedTransactionsCsv" in js)
check("Transaction section warns local-browser processing", "processed in your browser" in page_text)

check("Early-warning/watchlist positioning is explicit", "early-warning and watchlist" in page_text.lower())
check("Below-threshold result is explicitly not an all-clear", "not an “all clear”" in page_text.lower() or "not an all-clear" in page_text.lower())
check("Below result status is import-limited and modeled", "Below modeled economic-nexus threshold — based on imported data" in js)


check("Schema v5 is loaded", dataset.get("schema_version") == 5)
check("App version 1.3.3 is in dataset", dataset.get("app_version") == "1.3.3")
check("Rules/logic audit metadata is current", dataset.get("rules_logic_audit_date") == "2026-08-09" and dataset.get("measurement_period_audit_date") == "2026-08-09")
check("Professional note distinguishes nexus screening from filing frequency", "sales-tax return filing-frequency engine" in page_text and "complete nexus/compliance determination" in page_text)
check("State thresholds subtitle distinguishes screening from complete nexus/return timing", "does not determine complete nexus, return frequency, or due dates" in page_text)
check("Structured measurement engine is used", "measurement_code" in js and "getAnalysisMeasurementWindows" in js)
check("Historical threshold crossing detection exists", "historical threshold crossing detected" in js.lower())
check("Current-year historical YTD checkpoints exist", "historical current-year checkpoint" in js)
check("Structured threshold operators are used", "dollar_threshold_operator" in js and "transaction_threshold_operator" in js and "threshold_logic" in js)
check("Exact-boundary review controls exist", "dollar_review_floor" in js and "transaction_review_floor" in js and "threshold boundary ambiguity" in js.lower())
check("Reused document number across customers forces review", "document number reused across customers" in js.lower())
check("Negative sales/credits force review", "returns/credits present" in js.lower())
check("TPP-only limitation is explicit", "TPP-only threshold" in js)
check("Transaction definition is disclosed as a proxy", "State law may define a sale/transaction by invoice, order, contract, or another unit" in js)
check("Other-nexus and filing-frequency limitations are explicit", "actual sales-tax return filing frequency/due dates" in js)
for st,code in {
    "Minnesota":"ROLLING_12_MONTHS", "Pennsylvania":"PRIOR_CY", "Vermont":"ROLLING_12_MONTHS",
    "Illinois":"QUARTER_END_TRAILING_12", "Missouri":"QUARTER_END_TRAILING_12",
    "Connecticut":"CT_SEP30_YEAR", "New York":"NY_FOUR_SALES_TAX_QUARTERS",
    "Texas":"PRIOR_12_COMPLETE_CAL_MONTHS"
}.items():
    row=next(x for x in states if x["state"]==st)
    check(f"Audited measurement code for {st}", row.get("measurement_code")==code, str(row.get("measurement_code")))

# Dataset assumptions that drive the UI.
check("Exactly 51 jurisdictions", len(states) == 51, f"count={len(states)}")
check("Every jurisdiction has nexus sales scope", all(s.get("nexus_sales_scope") for s in states))
check("Every jurisdiction has a source URL", all(str(s.get("source_url", "")).startswith("https://") for s in states))
check("Every jurisdiction has a review date", all(re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(s.get("last_reviewed", ""))) for s in states))
dollar_only = [s for s in states if s.get("threshold") != "N/A" and str(s.get("transaction_test", "")).startswith("None")]
check("Dollar-threshold-only filter resolves to 30 jurisdictions", len(dollar_only) == 30, f"count={len(dollar_only)}")
transaction_prong = [s for s in states if str(s.get("transaction_test", "")) not in {"N/A", "None"} and not str(s.get("transaction_test", "")).startswith("None")]
check("Transaction-prong set resolves to 17 jurisdictions", len(transaction_prong) == 17, f"count={len(transaction_prong)}")

# Dense professional table heuristic: ensure the UI explicitly supports discoverability and mitigation.
check("Global search is discoverable", bool(soup.find(id="globalSearch", attrs={"placeholder": re.compile("Search all columns", re.I)})))
check("Per-column filters have a dedicated filter row", soup.find(id="filterRow") is not None)
check("Data-density mitigation includes horizontal scrolling + sticky state", ".table-wrap{overflow:auto" in compact_css and ".state-cell{position:sticky" in compact_css)

print(f"Static UI audit: {len(passes)} PASS, {len(failures)} FAIL")
for name in passes:
    print(f"- PASS: {name}")
if failures:
    for failure in failures:
        print(f"- FAIL: {failure}", file=sys.stderr)
    sys.exit(1)
