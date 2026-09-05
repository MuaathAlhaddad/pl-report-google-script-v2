# Architecture

This repo is one of three that together run a small shop's debt-tracking and sales system. This
document exists so that fact doesn't depend solely on an external, unversioned link surviving —
see "The three-project system" below for the durable version of what the linked diagram shows.
(This file is intentionally near-identical to the copy in `employee-debts-api` and
`employee-debts-app` — each repo should be understandable without needing the other two open.)

## This repo's role

`pl-report-google-script-v2` is the **owner-only** tool: a Google Apps Script web app, container-
bound to a Google Sheet, used every night to file a daily cash/sales report. It auto-fills fields
from Daftra, provides bulk Daftra invoice/payment entry tools, and hosts a P&L-style dashboard
(monthly/yearly/Hijri views), expense tracking, goals, and a supplier calendar. No employee-facing
surface — but it writes into Sheet tabs that employees later see via the separate PWA. See
`CLAUDE.md` for file-level detail.

## The three-project system

```
                    ┌──────────────────────────────┐
                    │   Google Sheet (one file)     │
                    │   opened by ID, not shared    │
                    │   code — two tabs are shared: │
                    │   "Debts Snapshot", "Employees"│
                    └───────┬───────────────┬────────┘
                            │               │
              container-bound              openById() (standalone)
                            │               │
         ┌──────────────────▼───┐   ┌───────▼───────────────┐
         │ pl-report-google-     │   │ employee-debts-api    │
         │ script-v2             │   │                       │
         │ (THIS REPO, OWNER     │   │ Standalone JSON API,  │
         │ only)                 │   │ no HtmlService, no    │
         │ HtmlService SPA,      │   │ Sheet UI of its own   │
         │ nightly cash/sales    │   │                       │
         │ entry + P&L dashboard │   │                       │
         │ + bulk Daftra tools   │   │                       │
         └───────────┬───────────┘   └───────────┬───────────┘
                     │                            │
                     │      both talk to          │ fetch() over
                     └───────────►Daftra◄─────────┘ Content-Type: text/plain
                        (shared account,               │
                         api2/*.json, APIKEY)   ┌───────▼───────────────┐
                                                 │ employee-debts-app     │
                                                 │ (employee PWA)         │
                                                 │ IndexedDB cache,       │
                                                 │ service-worker shell   │
                                                 └────────────────────────┘
```

- **Shared Google Sheet, by ID**: this repo is container-bound to it (the "normal" Apps Script
  relationship); `employee-debts-api` instead opens the same file by ID
  (`SpreadsheetApp.openById()`), reading/writing only its `Debts Snapshot` and `Employees` tabs.
  `DEBTS_SNAPSHOT_HEADERS` here is a **duplicated constant**, not shared code, deliberately kept
  in lockstep by hand with `employee-debts-api`'s `Daftra.gs` `DEBTS_HEADERS` — a mismatch should
  fail loudly, not silently misfile columns. Changing either tab's layout is a cross-repo breaking
  change.
- **`ImportShortDebts.gs`** is the direct bridge into that shared data: it writes into the shared
  `Debts Snapshot` tab so paper-notebook debts can be bulk-imported, in a row shape that
  deliberately mirrors `addShortDebt()` in `employee-debts-api/src/Debts.gs` exactly — so those
  rows are indistinguishable in the PWA from a debt an employee added by hand.
- **Shared Daftra account**, reached via `api2/*.json` with `DAFTRA_SUBDOMAIN`/`DAFTRA_API_KEY`
  Script Properties — set independently here, not shared with `employee-debts-api`'s Script
  Properties even though both hit the same account.
- **The `Employees` tab is also read here**, read-only, purely to populate a Creditor dropdown —
  kept as a fixed list per an explicit owner request (2026-08-25), not live-synced further than
  that.
- **Deployment model — different from `employee-debts-api`, do not assume the same rule applies**:
  the live URL here *is* the `@HEAD` deployment. `npm run watch` (chokidar) rebuilds and pushes on
  every save automatically — no `clasp deploy` needed for normal iteration, and the user is
  expected to keep that watcher running rather than push manually. This only works because only
  the owner, who has edit access to the script, ever opens this app. Contrast with
  `employee-debts-api`, which must be deployed to a specific versioned id or employees never
  receive the update.

## Financial writes here vs. the PWA's rule

`employee-debts-app` has a documented decision (see its `DECISIONS.md`, 2026-09-05) that
financial writes must be online-only with no offline queueing — driven by that app's offline-
capable PWA nature. **This repo has no offline capability at all** (a plain HtmlService web app
requires a live connection just to load), so that specific decision doesn't directly apply here —
but the underlying financial-write correctness concerns (confirm-before-success, no silent
retries, watch for duplicate submission) are equally real for this repo's own bulk Daftra tools
and are worth keeping in mind if this repo ever gains any kind of client-side queueing or retry
behavior of its own.

## Where to look next

- `CLAUDE.md` — file-by-file architecture detail, build pipeline, and Daftra-integration gotchas
  for this repo specifically (already thorough as of 2026-09-05 — this file complements it, not
  replaces it).
- `DECISIONS.md` — dated log of business/architecture decisions and confirmed incidents.
- `employee-debts-api`'s and `employee-debts-app`'s own `ARCHITECTURE.md`/`DECISIONS.md` — the
  other two-thirds of this system.
