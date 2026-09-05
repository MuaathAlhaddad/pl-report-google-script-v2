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
