// Records, at the moment a new Sales report is saved, exactly which Daftra
// supplier payments existed for that date -- one row per payment, keyed by
// Daftra's payment id. Later, comparing this snapshot with Daftra again
// shows precisely which payments were added, deleted or changed after the
// day was closed (the monthly reconciliation's main question), instead of
// only a difference in totals. Owner-approved 2026-10-26 (DECISIONS.md).
//
// Append-only: rows are never edited or deleted by the app. It's a
// separate tab, so the Sales sheet and its formulas are untouched.

const PAYMENTS_SNAPSHOT_SHEET = "Payments Snapshot";

const PAYMENTS_SNAPSHOT_HEADERS = [
    "Saved At",
    "Report Date",
    "Daftra Payment ID",
    "Journal ID",
    "Payment Code",
    "Supplier",
    "Amount",
    "Treasury",
    "Note",
    "Daftra Created",
    "Daftra Modified",
    "Daftra Total (day)",
    "Report Payments Total (day)",
];

function getPaymentsSnapshotSheet_() {
    const ss = SpreadsheetApp.getActive();
    let sheet = ss.getSheetByName(PAYMENTS_SNAPSHOT_SHEET);

    if (!sheet) {
        sheet = ss.insertSheet(PAYMENTS_SNAPSHOT_SHEET);
        sheet.appendRow(PAYMENTS_SNAPSHOT_HEADERS);
        sheet.setFrozenRows(1);
        sheet
            .getRange(1, 1, 1, PAYMENTS_SNAPSHOT_HEADERS.length)
            .setFontWeight("bold");
    }

    return sheet;
}

// Re-fetches from Daftra at save time (rather than trusting what the form
// loaded earlier) so the snapshot reflects Daftra at the moment of closing.
// reportExpression is the "a+b+c" actually saved to column E -- it may
// differ from Daftra if the owner edited the field, and both totals are
// kept so that difference is visible.
function savePaymentsSnapshot_(dateStr, reportExpression) {
    const daftra = getDaftraSupplierPayments(dateStr);
    const reportTotal = round2_(
        calculatePayments(reportExpression || "").total || 0,
    );
    const savedAt = new Date();

    const rows = daftra.payments.map((p) => [
        savedAt,
        dateStr,
        p.paymentId,
        p.journalId,
        p.code,
        p.supplier,
        p.amount,
        p.treasuryName,
        p.note,
        p.created,
        p.modified,
        daftra.total,
        reportTotal,
    ]);

    // Still record that the snapshot ran on a day with no payments, so an
    // empty day can't be confused with a day that was never snapshotted.
    if (!rows.length) {
        rows.push([
            savedAt,
            dateStr,
            "(none)",
            "",
            "",
            "",
            0,
            "",
            "",
            "",
            "",
            0,
            reportTotal,
        ]);
    }

    const sheet = getPaymentsSnapshotSheet_();
    // Report Date / IDs as plain text, so Sheets doesn't turn them into
    // dates or strip leading zeros.
    sheet
        .getRange(
            sheet.getLastRow() + 1,
            1,
            rows.length,
            PAYMENTS_SNAPSHOT_HEADERS.length,
        )
        .setNumberFormats(
            rows.map(() => [
                "yyyy-mm-dd hh:mm:ss",
                "@",
                "@",
                "@",
                "@",
                "@",
                "#,##0.00",
                "@",
                "@",
                "@",
                "@",
                "#,##0.00",
                "#,##0.00",
            ]),
        )
        .setValues(rows);
}
