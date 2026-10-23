# QA Report Desk (self-hosted)

Build test evidence documents (title, ticket, test cases, screenshots) with a Pass/Fail summary, and export to Word, Excel or HTML.

## Use online (no install)
Open the published GitHub Pages link. Nothing to install or start.
Documents and screenshots are saved **in your own browser** (not on a server), so they are private to you and stay on that computer and browser.
Use **Export** (Word / Excel / HTML) to keep or share a copy. Clearing site data in the browser deletes saved documents.

Publishing: push to the `main` or `master` branch; in the repo go to Settings > Pages > Source and choose **GitHub Actions**. The workflow in `.github/workflows/pages.yml` publishes the `public` folder.

## Run on your own machine or server (optional)
Only needed if you want documents stored in a shared `data` folder instead of each browser.

    npm install
    npm start                 # http://localhost:3000

Options (environment variables): `PORT=8080`, `HOST=0.0.0.0` (share on your network), `DATA_DIR=/path/to/data`.

## Where data lives
`data/docs/*.json` (documents) and `data/shots/*.txt` (screenshots). Back up or copy the `data` folder to move everything.
There is no login. If you expose it beyond your own machine, put it behind your company VPN or a reverse proxy with authentication.

## Features
- Two templates: **Test evidence document** and **Bug report** (create them from the side menu).
- Overall result shown as a pass percentage (passed / total test cases).
- Pass / Fail / Blocked / Not run per test case; live summary; click a row to jump to the case.
- Word and HTML exports have a clickable summary and "Back to summary" links; Excel has a Summary tab with links.
- Bold, italic, underline, bullets, numbered lists, text colour and highlight in description, test data and remarks.
- Screenshots: paste (Ctrl+V), drop or browse; they fit a fixed frame; same frame is used in exports.
- Autosave; the side menu lists "My documents" to reopen, duplicate or delete (on a phone, open it with the menu button).
- Export / Import (to move work to another browser or computer): the side menu has **Export all**, **Export selected** (tick any documents, get one file) and **Import**; each document also has its own **Export** button for just that one. When an imported file holds several documents, a list appears so you tick only the ones you want (documents you already have in the same or a newer version are marked and skipped). Import also accepts old `data/docs/*.json` files together with their `data/shots/*.txt` screenshots.
- Cards collapse and expand (▾ on each card, plus Collapse all / Expand all); a collapsed card shows a one-line summary.
- Summary is collapsible too; its header has Collapse all / Expand all for every card.
- "+ Add below" on every test case / bug inserts a new one right after it; numbers update automatically.
