# Changelog

Application changes, newest first. The reasoning behind each change goes in
[DECISIONS.md](DECISIONS.md); this file records what changed.

---

## 2026-10-27

### Fixed — Supplier payments showed "No treasury" and no supplier name

- With the API key, Daftra's journals don't include account details, so every payment was
  flagged. Treasury and supplier are now looked up by account id (cached 6 hours). Amounts
  and the Payments total were unaffected.

---

## 2026-10-26

### Added — Supplier Payments auto-filled from Daftra

- **Sales form:** the Payments field is pre-filled with that day's Daftra supplier payments
  (`a+b+c`, oldest first) via new `getDaftraSupplierPayments()` in `Daftra.gs`. It stays
  editable. Under the total, the form shows Daftra's count and total, warns if the field no
  longer matches Daftra, and lists any payment not paid from the main cash box (e.g. a bank
  transfer) with a note. If Daftra can't be read completely, the field is left empty and the
  error is shown.
- **New `Payments Snapshot` tab** (`PaymentsSnapshot.gs`), created on first use: when a new
  report is saved, one row per Daftra payment for that date (payment ID, journal ID, code,
  supplier, amount, treasury, note, Daftra created/modified, Daftra day total, saved day total).
  Append-only. If it fails, the report is still saved and an alert says so.
- `testDaftraSupplierPayments()` logs the raw journals response and the parsed result for one day.
- Not changed: how column E is written, the Total Sales formula, historical rows, or anything in
  Daftra (read-only).

**Reason:** Removes the nightly manual copy of supplier payments and keeps a per-payment record
for the monthly Daftra reconciliation.

---

## 2026-10-14

### Security — Web app restricted to the owner

- **`appsscript.json`:** `webapp.access` is now `MYSELF` (was `ANYONE`, i.e. any Google
  account). This governs the `@HEAD` URL the owner uses.
- **New `Auth.gs`:** `requireAuthorizedUser_()` guards every client-callable server function;
  `doGet()` shows an "Access denied" page to anyone else. Allowed accounts: the
  `ALLOWED_EMAILS` Script Property, or only the script owner when it's unset.
- These guard calls were already live before this commit (pushed but uncommitted); this
  commit records them exactly as they were found in the Apps Script project.

**Reason:** Anyone with a Google account and the URL could previously run the app with the
owner's permissions.

---

## 2026-10-07

### Changed — Disable `Credit Invoices` and `Customer Payments` from the Sales calculation

- **Total Sales no longer uses either field.** `calculateTotalSales()` (`Utils.gs`) is now
  `Closing Cash + Payments + Daily Expense + Other Expenses + Debt Withdrawal − Cash Deposit − Starting Cash`.
- **New reports write `0`** to the Sales sheet's Credit Invoices (column C) and Customer Payments
  (column H), whatever the client sends. This applies from the report dated **2026-10-06**
  (`CREDIT_AND_CUSTOMER_PAYMENTS_DISABLED_FROM` in `Utils.gs`), the first one after the last
  existing row (2026-10-05).
- **The Google Sheet columns are intentionally kept** — not deleted, renamed, moved or recreated.
- **Historical values are unchanged.** Nothing migrates or clears them. When a report dated before
  2026-10-06 is edited, or recalculated by the Starting Cash forward cascade, its C/H cells are
  written back exactly as stored and its Total Sales keeps the formula it was saved with, so an
  edit can't rewrite a historical total.
- **No longer fetched from Daftra:** `getDaftraDailyTotals()` stops calling the Credit Invoices and
  Customer Payments lookups, and those now-unused helpers were removed (`getDaftraCreditInvoices`,
  `getDaftraCustomerPayments`, `getDaftraInvoicePayments`, `getDaftraClientAccountPayments`).
- **UI:** both fields were removed from the New Sales Report form, the Edit modal (and its
  validation and edit log), and the Credit / Client Pay columns in the sales table. The unused
  client-side `calculateTotalSalesClient()` (which still added/subtracted them) was removed.
  Deleting a report still logs its full stored row, C/H included.

**Reason:** These fields should no longer affect the daily sales calculation, but the existing
Google Sheet structure and historical records must be preserved.
