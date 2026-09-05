# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Google Apps Script web app, container-bound to a Google Sheet, that a small shop's owner uses every night to file a daily cash/sales report. It auto-fills several fields from Daftra (an external invoicing/ERP SaaS) via its JSON API, and includes a few "bulk data entry" tools (creating multiple Daftra invoices/payments at once) that also talk to Daftra directly.

For how this project fits together with `employee-debts-api` and `employee-debts-app` (shared Sheet, shared Daftra account), see the [architecture diagram](https://claude.ai/code/artifact/5fd8bd90-a0b1-4389-926a-859cb014fa91) and, for a version-controlled fallback that doesn't depend on that external link surviving, this repo's own [ARCHITECTURE.md](ARCHITECTURE.md).

**Before making a non-trivial change, check [DECISIONS.md](DECISIONS.md) first** — dated business/architecture decisions and confirmed incidents that aren't otherwise visible from reading the current code.

## Development workflow

- **Never run `node build.js` or `clasp push` manually.** The user keeps `npm run watch` (chokidar) running in a terminal at all times; it rebuilds and pushes to the live Apps Script project automatically on every save under `src/`. Just edit and save.
- **Hard rule, with one deliberate exception for debugging:** because `npm run watch` auto-pushes to the live `@HEAD` URL on every save, *every* save here is already "production" in a way the other two repos' `clasp push` isn't — there's no separate "just testing" push vs. a real deploy step. So: an **intentional, working change** must get a git commit promptly (with a `DECISIONS.md` entry if it's the kind of change that file covers) — not batched up across a session. A **momentary, exploratory edit you're actively iterating on** (e.g. tweaking a value to see what the watcher pushes, mid-debug) doesn't need a commit for every single save, but don't let it sit uncommitted once you've settled on the real version, and never describe an uncommitted save as a finished change. The sibling `employee-debts-api` repo has a documented real incident of exactly the batched-catch-up failure mode (see that repo's `KNOWN_ISSUES.md`) — a run of live changes was never committed until a later, much less detailed catch-up commit.
- The live web app URL is the `@HEAD` deployment, which always serves the latest pushed code — `clasp push` alone updates it immediately, no `clasp deploy` needed for normal iteration. `clasp deploy` (no flags) instead creates a new *versioned* deployment, unrelated to that URL.
- If a fix seems to "not take effect," suspect browser/iframe caching (hard refresh, incognito) before re-debugging the source.
- `npm run format` — Prettier (4-space tabs, double quotes, 80 print width; see `.prettierrc`).
- `npm run pull` / `npm run open` / `npm run logs` — thin wrappers around the corresponding `clasp` commands.
- There is no test suite or linter beyond Prettier. For a real correctness check on `.gs`/`.js` files, copy to a temporary `.js` file and run `node --check` on it (Apps Script's `.gs` extension isn't recognized by Node directly).

## Build pipeline (`build.js`)

`src/` mirrors nothing in `dist/` structurally — every file is flattened into `dist/`'s root, and the *extension* decides the transformation:

| `src/` | → `dist/` | Transformation |
|---|---|---|
| `GS/*.gs` | same filename | copied as-is (server-side Apps Script) |
| `JS/*.js` | `name.js.html` | wrapped in `<script>...</script>` |
| `CSS/*.css` | `name.css.html` | wrapped in `<style>...</style>` |
| `Views/*.html` | same filename | copied, with `include("folder/name.ext")` rewritten to `include("name.ext")` (folder prefixes only make sense in `src/`, not the flattened `dist/`) |

Because everything lands flat in `dist/`, **filenames must be unique across the whole `src/` tree**, not just within their own subfolder.

`Code.gs`'s `include(filename)` (`HtmlService.createHtmlOutputFromFile(filename).getContent()`) is what `Views/*.html` files use to pull in JS/CSS/other views — e.g. `<?!= include("JS/app.js"); ?>` in a `src/` file becomes `<?!= include("app.js"); ?>` after the build rewrite, resolving to `dist/app.js.html`.

A `Views/*-script.html` file (e.g. `bulkInvoice-script.html`) is a deliberate exception: it's raw JavaScript given an `.html` extension specifically so `build.js` does *not* wrap it in `<script>` tags — see "Lazy-loaded tabs" below for why.

## Templating and page structure

`Views/Index.html` is the only template Apps Script evaluates (`doGet()` → `HtmlService.createTemplateFromFile("Index")`); every other view is either baked into it via `include()` or fetched later. The app is a single-page app with hand-rolled tab routing (`JS/router.js`'s `showTab()`), not baked into separate Apps Script pages.

**Lazy-loaded tabs:** Apps Script's HtmlService renders the initial page via the browser's `document.write`, which has a real, reproducible total-size ceiling — past it, `document.write` throws a `SyntaxError` on an arbitrary token partway through the page. Any sufficiently large tab (Bulk Invoice, Bulk Payment) is therefore *not* included in `Index.html` at build time. Instead:
- A small loader in `JS/` (e.g. `bulkInvoice.js`) is baked into `Index.html` and defines a `loadXPage()` function.
- The real markup/styles/logic live in `Views/x.html`, `CSS/x.css`, and `Views/x-script.html`, and are served on demand by a `getXBundle()` Apps Script function (e.g. `BulkInvoice.gs`) that returns `{ html, css, js }` via three `include()` calls.
- `loadXPage()` fetches that bundle once, injects the CSS into `<head>`, `eval`s the JS via a `<script>` element (which redefines `loadXPage()` itself with the real implementation), and injects the HTML — then immediately calls itself again so the real logic runs.

When adding a new tab with any real amount of markup/logic, follow this pattern rather than baking it into `Index.html` directly.

## Data layer

The bound Google Sheet is the only datastore; `CONFIG.SHEETS` (`Config.gs`) names the tabs the app manages directly (`Sales`, `Expenses`, `ExpenseSetup`, `Goals`, `Suppliers`). Sheets not listed there but still read/written by this app (`Daily Entry Log`, `Import Short Debtors`) define their own sheet-name constants next to the code that owns them, since they're single-feature concerns.

**This spreadsheet is shared with a separate, sibling Apps Script project, `employee-debts-api`** (a standalone JSON API for an employee-facing PWA, `employee-debts-app` — both live outside this repo). That project opens the same file by ID (`SpreadsheetApp.openById()`, not container binding) and reads/writes the `Debts Snapshot` and `Employees` tabs. Changes to those two tabs' column layout are a cross-repo breaking change.

## Daftra integration (`GS/Daftra.gs` + the `Bulk*.gs` tools)

Daftra is reachable two genuinely different ways, and mixing them up is the most common source of bugs here:
- **`/api2/*.json`** (e.g. `invoices.json`, `client_payments.json`), authenticated with an `APIKEY` header (`DAFTRA_API_KEY` / `DAFTRA_SUBDOMAIN` Script Properties). This is what every read (`getDaftra*` functions) and write (`createDaftraInvoice_`, `createDaftraClientPayment_`) in this codebase uses.
- **`/owner/...` HTML pages** — Daftra's regular web UI, session-cookie-gated, with **no JSON API backing them at all** for some reports (confirmed for the Supplier Payments report: it's plain server-rendered HTML, no XHR/fetch call to reuse). Don't assume a report you can see in the browser has an API equivalent — check via `daftraGet_` against a guessed endpoint name and a `test*()` diagnostic function before building UI around it.

Other load-bearing, non-obvious facts about this integration:
- List responses wrap each item one level deeper than expected (e.g. `{ "Invoice": { ... } }`, not the fields directly on the item) — `daftraUnwrap_(item, key)` handles this; `daftraExtractList_(payload)` handles the outer wrapper key also being inconsistent across endpoints (`data`, `result`, or the model name).
- A 400 response's top-level `message` is a generic "fix the errors below" — the actual reason is in `validation_errors`, parsed out explicitly in `createDaftraInvoice_`/`createDaftraClientPayment_` rather than surfaced raw.
- Creating an invoice requires `client_email` even for clients with none on file, or Daftra rejects it outright when their "invoicing method" is Email — always send a real address or an RFC 2606 `*.invalid` placeholder, never omit it.
- Creating a client payment requires `status: 1` explicitly, or it's silently accepted (200, real ID) but never actually shows up anywhere in Daftra.
- Every `Bulk*.gs` write (`createBulkSalesInvoices`, `createBulkClientPayments`) processes each row independently inside its own try/catch — one bad row must never lose the rest of the batch — and both log every attempt (success or failure) to the "Daily Entry Log" sheet via `logDailyEntry_()` (`DailyEntryLog.gs`).
- Client/product/treasury lookups paginate fully (no fixed page cap) — a fixed cap previously hid real records once the account grew past it.

When adding a new Daftra endpoint, add a corresponding `test*()` function (see the existing `testDaftra*` functions) that logs the raw response before wiring it into real UI — Daftra's API docs (docs.daftara.dev) are inconsistent enough that this has caught real mismatches every time.
