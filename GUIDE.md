# Beginner GitHub Setup & Tax-Data Update Guide — v1.1

The illustrated, click-by-click manual is available as **`guide.html`** and is published with the GitHub Pages site.

## Recommended first-time setup

1. Unzip the project and verify `index.html`, `data/state-nexus.json`, and `.github/workflows/deploy.yml`.
2. Use GitHub Desktop to create an empty local repository named `state-sales-tax-nexus`.
3. Copy the **contents** of the project folder into the repository root.
4. Commit to `main` and publish the repository.
5. On GitHub.com, open **Settings → Pages → Build and deployment → Source → GitHub Actions**.
6. Open **Actions** and confirm **Deploy GitHub Pages** completes successfully.
7. Open the published site and perform the acceptance checks in `guide.html`.

## Controlled update workflow

Research → Stage JSON → Review field-by-field diff and primary authority → Approve → Download `state-nexus.json` and `update-history.json` → Commit through a reviewed branch/PR → Merge → Verify GitHub Pages → Test Excel export.

The full manual includes current-law training examples for Illinois and Kentucky, screenshots of the loaded app, workflow illustrations, troubleshooting, and publish controls.

## Official GitHub references

- GitHub Pages publishing source: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- Automatic Pages deployment: https://docs.github.com/en/get-started/start-your-journey/deploying-your-website-automatically
- GitHub Desktop getting started: https://docs.github.com/en/desktop/overview/getting-started-with-github-desktop


## Version 1.1 update controls

- Use **Selected states (up to 10)** for controlled research batches.
- Multi-select filters are available for State/Jurisdiction, Review status, Tax regime, Transaction test, and Nexus threshold sales scope.
- Research JSON may include `change_detected` and `change_note`. A material requirement change triggers the flashing siren and a red star beside the affected state until the proposal is resolved.
- The top and bottom horizontal scrollbars stay synchronized for wide-table review.
- Source URLs were revalidated on 2026-08-08; see `SOURCE_URL_AUDIT.md`.
