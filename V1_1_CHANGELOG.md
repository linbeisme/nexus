# Version 1.1 Release Notes

**Release QA date:** 2026-08-08

## User-interface changes

- Displays **Version 1.1** in the application header.
- Adds a single **money bag (💰) favicon/bookmark icon**.
- Adds a professional **Day / Night** theme toggle with browser persistence.
- Styles Excel export actions in **dark green with white text**.
- Styles filter, research, staging, review, and publish inputs in **light yellow**.
- Styles non-primary action buttons in **light purple** while retaining existing dark-blue primary actions and red danger actions.
- Adds a synchronized **top horizontal scrollbar** in addition to the table's bottom scrollbar.
- Moves the result/count indicators directly beside the **Beginner setup & update guide** control.

## Research and change-control changes

- Adds a **Selected states (up to 10)** research scope with search and checkbox selection.
- Adds multi-criteria checkbox filters for:
  - State / jurisdiction
  - Review status
  - Tax regime
  - Transaction test
  - Nexus threshold sales scope
- Adds material-change alerting:
  - flashing red siren beside the published-baseline badge when a staged/published material requirement change is flagged;
  - red star beside affected states;
  - reminder text naming states that require review/update.
- Research prompts now request `change_detected` and `change_note` in addition to the substantive nexus fields and instruct the researcher to revalidate primary-source URLs.
- Material differences are staged for review before approval; approval clears the alert for the accepted working-copy change.

## Source-link and QA changes

- Refreshed and point-in-time validated the primary-source link for all **51 jurisdictions** on 2026-08-08.
- Added `SOURCE_URL_AUDIT.md` with the jurisdiction-by-jurisdiction link audit.
- Dataset schema bumped to **v4** so browsers do not silently reuse a stale v1.0 local working copy after deployment.
- Static UI audit expanded to **99 checks**.
- Deployment validates schema v4, app version 1.1, and the 51-link audit metadata before publishing.

## Change-detection limitation

The GitHub Pages app is static and does not continuously crawl state websites by itself. A change alert is raised when the controlled research/update workflow returns an explicit `change_detected: true`, when a material staged field differs from the published record, or when a published record carries an unresolved change flag. This prevents the UI from implying real-time legal monitoring that is not actually occurring.


## UI refinement (2026-08-08)
- Reworked multi-select filter popovers to prevent clipping, narrow text wrapping, and overlapping open menus.
- Split header publication metadata into three compact lines.
- Added a collapsible state selector for the up-to-10-state research workflow; it is collapsed by default to save vertical space.
## UI alignment patch

- Rebuilt multi-select filter option rows so each checkbox is fixed on the left and each criterion label is aligned to its right without clipping.
- Increased and column-tuned the filter popover width, including extra room for long transaction-test criteria.
- Added a **Clear prompt** action in the controlled research workflow.
- Moved the guide + result-status chips to their own row immediately below the primary toolbar actions.
- Changed the **Beginner setup & update guide** control to a navy-blue badge/button with white text.

