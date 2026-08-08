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
    "editForm", "editFields", "saveEdit"
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
check("Phone toolbar controls expand full width", ".toolbar-row>*{width:100%}" in compact_css)

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
