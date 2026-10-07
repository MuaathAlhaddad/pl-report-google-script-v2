# Changelog

Application changes, newest first. The reasoning behind each change goes in
[DECISIONS.md](DECISIONS.md); this file records what changed.

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
