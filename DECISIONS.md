# Decisions

A curated, reverse-chronological log of business/architecture decisions and confirmed incidents
for this repo — the "why," not the "what." Add a new entry in the **same commit** as the change
that implements it. Given `npm run watch` auto-pushes on every save (see "Hard rule" in
`CLAUDE.md`), it is especially easy here for live behavior to drift ahead of what's committed —
don't let a save-triggered auto-deploy substitute for actually committing.

Entries below are extracted from this repo's own (already thorough) `CLAUDE.md` into this
dated-log format on 2026-09-05, as part of a cross-repo documentation audit — see that file for
full technical detail on each.

---

## 2026-09-22 — Sales report editing: identify rows by date, recalc Total Sales, don't touch Starting Cash

**Decision:** A new Edit modal on the Sales tab (`getReportForEdit`/`updateReport` in `Sales.gs`,
`salesEdit.js`, `sales-edit-modal.html`) lets an existing report's numbers be corrected. Key
choices:
- The row to edit is located by scanning column A for the report's **date**, both when the modal
  opens and again inside `updateReportLocked_`'s lock — never by a row number carried across the
  round trip, since rows can shift if the sheet is sorted/edited by hand.
- Date and Starting Cash are read-only in the modal. Starting Cash is a snapshot of the *previous*
  row's closing cash taken once at save time (see `getStartingCash()`), not a live formula, so
  editing an older report's Closing Cash/Cash Withdrawal won't retroactively update any later
  report's already-stored Starting Cash — the edit only warns about this (`cashChanged` +
  `isLatest` in `updateReport`'s response) rather than trying to cascade-recalculate every
  subsequent row, which would be a much larger change than this task needed.
- `updateReport` recalculates and rewrites Total Sales (column L) using the same
  `calculateTotalSales()` the create flow uses, then returns `getDashboard()`'s output directly —
  every dashboard (monthly/yearly/Hijri) already reads Total Sales from that one column, so nothing
  else needed to change.
- Edits validate more strictly than `saveReportLocked_` (which silently coerces bad input to 0):
  a blank/negative/non-numeric field on an *edit* is rejected outright, since silently zeroing a
  previously-correct report is worse than doing it on a brand-new one.
- Every changed field is logged to a new "Sales Edit Log" sheet (date/time/editor/field/old/new),
  following the same get-or-create-sheet convention as `DailyEntryLog.gs` — a new sheet rather than
  reusing Daily Entry Log, since that log's columns (Client/Amount/Reference) are shaped for Daftra
  bulk-entry review and don't fit a per-field before/after diff.

**Why:** Owner's request, 2026-09-22 — add the ability to edit an existing sales record safely,
without corrupting the totals downstream reports depend on.

---

## 2026-09-19 — Sales reports: one row per date, enforced server-side

**Decision:** `saveReport()` (`Sales.gs`) rejects a save if the Sales sheet already has a row for
that date, and runs under `LockService.getScriptLock()` so the check and the write can't
interleave. The form's Save button is also disabled while the request is in flight.

**Why:** Confirmed incident — 11/09/2026 ended up with two identical rows in the Sales sheet
(identical in every column, i.e. the same submission saved twice, consistent with a double-click
or retry while the first save was still running). Nothing prevented it: the Save button stayed
clickable until the server responded, and `saveReport()` blindly appended at `getLastRow() + 1`.
The duplicate check is server-side because the client-side disable alone wouldn't stop two tabs or
a retry after a timeout. The already-duplicated 11/09 row was not removed automatically — delete
the extra row by hand.

## 2026-08-25 — Creditor dropdown kept as a fixed list, not live-synced further

**Decision:** The `Employees` sheet (shared with `employee-debts-api`) is read here read-only,
purely to populate a Creditor dropdown in bulk-entry tools, kept as a fixed list.

**Why:** Owner's explicit request, 2026-08-25.

## 2026-08-25 — Removed a fixed page cap on client lookups

**Decision:** Client/product/treasury lookups paginate fully now, no fixed page cap.

**Why:** A previous fixed cap (5 pages / 500 records) silently hid real clients once the account
grew past it — confirmed concretely: client #27, an active real debtor, fell outside that cap and
went undetected. This is the same class of bug `employee-debts-api`'s `daftraPaginate_()` was
built to avoid from the start (see that repo's `DECISIONS.md`, 2026-08-24 entry).

## 2026-08-24 — Daftra invoice creation always sends a client_email, real or placeholder

**Decision:** `createDaftraInvoice_()` always sends a `client_email` value, even for clients with
none on file (a real address or an RFC 2606 `*.invalid` placeholder).

**Why:** Daftra rejects an invoice outright when the client's invoicing method is "Email" and no
address is present — confirmed against a real rejected invoice.

## 2026-08-25 / 2026-08-28 — Daftra error handling: parse validation_errors, not the top-level message; client_payments need status: 1

**Decision:** Daftra write helpers (`createDaftraInvoice_`, `createDaftraClientPayment_`) parse
`validation_errors` explicitly rather than surfacing the generic top-level `message` ("fix the
errors below"). Client payments always send `status: 1` explicitly.

**Why:** A 400's top-level message is useless for debugging — the real per-field reason is only in
`validation_errors`. Separately, a client payment created without `status: 1` returns a
misleadingly successful-looking response (200, a real record id) but silently lands in a
non-"Completed" status and never actually shows up anywhere in Daftra — confirmed against a real
rejected invoice, id #16658.

## 2026-08-27 — Daily Entry Log added for reviewing data-entry clerk work

**Decision:** Every `Bulk*.gs` write (`createBulkSalesInvoices`, `createBulkClientPayments`) logs
every attempt (success or failure) to a "Daily Entry Log" sheet, and processes each row inside its
own try/catch so one bad row never loses the rest of the batch.

**Why:** Owner's request, 2026-08-27, quoted in this repo's `CLAUDE.md`: "review data entry clerk
work in Daftra system."

## (undated, standing rule) — Every debt-tracking sale books against one fixed Daftra service

**Decision:** A "customer owes us money" sale is booked as a due invoice against one fixed Daftra
service (id 1615), never itemized products.

**Why:** Confirmed directly from that Daftra service's own product page as the intended target;
this is a business-process rule, not an implementation shortcut — don't change this id casually.
