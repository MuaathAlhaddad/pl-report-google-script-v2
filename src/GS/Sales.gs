function getNewReportData() {
    const date = getNextDate();

    // Auto-fill what Daftra already knows; supplier Payments and Cash
    // Withdrawal stay manual since Daftra has no clean data for those.
    const daftra = getDaftraDailyTotals(date);

    return {
        date,
        startingCash: getStartingCash(),
        cash: 0,
        creditInvoices: daftra.creditInvoices,
        payments: "",
        dailyExpense: 285,
        otherExpenses: daftra.otherExpenses,
        customerPayments: daftra.customerPayments,
        cashWithdrawal: 0,
        withdrawalNote: "",
        cashDeposit: daftra.cashDeposit,
        depositNote: "",
        daftraErrors: daftra.errors,
    };
}

function getStartingCash() {
    const sheet = SpreadsheetApp.getActive().getSheetByName(
        CONFIG.SHEETS.SALES,
    );

    const lastRow = sheet.getLastRow();

    // No previous reports
    if (lastRow <= 1) {
        return 0;
    }

    const row = sheet.getRange(lastRow, 1, 1, 12).getValues()[0];

    // Column B = Closing Cash
    const closingCash = Number(row[1]) || 0;

    // Column I = Cash Withdrawal
    const withdrawal = Number(row[8]) || 0;

    const startingCash = closingCash - withdrawal;

    return Math.max(startingCash, 0);
}

function getReport(row) {
    const sheet = SpreadsheetApp.getActive().getSheetByName(
        CONFIG.SHEETS.SALES,
    );

    const r = sheet.getRange(row, 1, 1, 12).getValues()[0];

    return {
        row,

        date: Utilities.formatDate(
            r[0],

            Session.getScriptTimeZone(),

            "yyyy-MM-dd",
        ),

        cash: r[1],

        creditInvoices: r[2],

        payments: r[4],

        dailyExpense: r[5],

        otherExpenses: r[6],

        customerPayments: Math.abs(r[7]),

        cashWithdrawal: r[8],

        cashDeposit: Math.abs(r[9]),
    };
}

// Locates a Sales row by its exact date (yyyy-MM-dd) instead of a row
// number -- row position isn't trusted across a round trip since rows can
// shift if the sheet is sorted/edited by hand (see ARCHITECTURE.md).
// Returns null if no row matches.
function findSalesRowByDate_(sheet, dateStr) {
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return null;

    const tz = Session.getScriptTimeZone();
    const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

    for (let i = 0; i < values.length; i++) {
        const value = values[i][0];
        if (
            value instanceof Date &&
            Utilities.formatDate(value, tz, "yyyy-MM-dd") === dateStr
        ) {
            return i + 2; // sheet row, 1-indexed + header row
        }
    }

    return null;
}

// Full record for the Edit modal -- unlike getReport(), this reads all 14
// columns (including notes and Starting Cash) and reads the Payments cell's
// formula rather than its computed value, since saveReportLocked_ stores it
// as "=500+300" so the sheet can show the sum; getValues() on that cell
// would return the evaluated total, not the original expression.
function getReportForEdit(dateStr) {
    const sheet = SpreadsheetApp.getActive().getSheetByName(
        CONFIG.SHEETS.SALES,
    );

    const row = findSalesRowByDate_(sheet, dateStr);

    if (!row) {
        throw new Error(
            "No sales report found for " +
                dateStr +
                ". It may have been deleted or moved.",
        );
    }

    return readReportForEdit_(sheet, row);
}

function readReportForEdit_(sheet, row) {
    const r = sheet.getRange(row, 1, 1, 14).getValues()[0];
    const paymentsFormula = sheet.getRange(row, 5).getFormula();

    return {
        row,
        date: Utilities.formatDate(
            r[0],
            Session.getScriptTimeZone(),
            "yyyy-MM-dd",
        ),
        cash: r[1],
        creditInvoices: r[2],
        payments: paymentsFormula ? paymentsFormula.replace(/^=/, "") : "",
        dailyExpense: r[5],
        otherExpenses: r[6],
        customerPayments: Math.abs(r[7]),
        cashWithdrawal: r[8],
        cashDeposit: Math.abs(r[9]),
        startingCash: Math.abs(r[10]),
        totalSales: r[11],
        withdrawalNote: r[12] || "",
        depositNote: r[13] || "",
        isLatest: row === sheet.getLastRow(),
    };
}

// Stricter than saveReportLocked_'s coercion-to-0 on purpose: silently
// zeroing a bad edit would corrupt a report that was previously correct,
// which is a worse failure than it happening on a brand-new one.
function validateEditData_(data) {
    const numberField = (value, label) => {
        const n = Number(value);

        if (value === "" || value === null || value === undefined || Number.isNaN(n)) {
            throw new Error(label + " must be a number.");
        }

        if (n < 0) {
            throw new Error(label + " can't be negative.");
        }

        return n;
    };

    const payments = String((data && data.payments) || "").trim();

    if (payments && !/^\d+(\.\d+)?(\+\d+(\.\d+)?)*$/.test(payments)) {
        throw new Error(
            "Payments must look like 500+300+1200 (numbers separated by +).",
        );
    }

    return {
        cash: numberField(data.cash, "Closing Cash"),
        creditInvoices: numberField(data.creditInvoices, "Credit Invoices"),
        payments,
        dailyExpense: numberField(data.dailyExpense, "Daily Expense"),
        otherExpenses: numberField(data.otherExpenses, "Other Expenses"),
        customerPayments: numberField(
            data.customerPayments,
            "Customer Payments",
        ),
        cashWithdrawal: numberField(data.cashWithdrawal, "Cash Withdrawal"),
        cashDeposit: numberField(data.cashDeposit, "Cash Deposit"),
        withdrawalNote: String((data && data.withdrawalNote) || "").trim(),
        depositNote: String((data && data.depositNote) || "").trim(),
    };
}

// Edits are serialized the same way saves are (see saveReport()) so a
// double-click/retry can't race the row lookup and the write.
function updateReport(originalDate, data) {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
        return updateReportLocked_(originalDate, data);
    } finally {
        lock.releaseLock();
    }
}

function updateReportLocked_(originalDate, data) {
    const sheet = SpreadsheetApp.getActive().getSheetByName(
        CONFIG.SHEETS.SALES,
    );

    // Re-locate the row fresh, inside the lock -- never trust a row number
    // handed back from when the modal was opened.
    const row = findSalesRowByDate_(sheet, originalDate);

    if (!row) {
        throw new Error(
            "This report (" +
                originalDate +
                ") no longer exists in the Sales sheet -- it may have been " +
                "deleted. Refresh and try again.",
        );
    }

    const before = readReportForEdit_(sheet, row);
    const clean = validateEditData_(data);

    // Starting Cash is never edited directly -- it's re-read from the sheet
    // so the edit can't silently disagree with whatever the previous day's
    // chain actually wrote it as.
    const startingCash = before.startingCash;

    const totalSales = calculateTotalSales(
        Object.assign({}, clean, { startingCash }),
    );

    const paymentInfo = calculatePayments(clean.payments);

    sheet.getRange(row, 1, 1, 14).setValues([
        [
            new Date(originalDate), // A Date -- unchanged
            clean.cash, // B Closing Cash
            clean.creditInvoices, // C Credit
            paymentInfo.count, // D Payment Count
            clean.payments ? "=" + clean.payments : "", // E Payments
            clean.dailyExpense, // F Daily Expense
            clean.otherExpenses, // G Other Expense
            -clean.customerPayments, // H Client Payments
            clean.cashWithdrawal, // I Cash Withdrawal
            -clean.cashDeposit, // J Cash Deposit
            -startingCash, // K Starting Cash -- unchanged
            totalSales, // L Total Sales -- recalculated
            clean.withdrawalNote, // M Withdrawal Note
            clean.depositNote, // N Deposit Note
        ],
    ]);

    logSalesEdit_(originalDate, before, Object.assign({}, clean, { totalSales }));

    const period = Utilities.formatDate(
        new Date(originalDate),
        Session.getScriptTimeZone(),
        "yyyy-MM",
    );

    return {
        // Reuses the exact aggregation the normal dashboard load uses, so
        // the table and summary cards refresh from one source of truth in
        // this same round trip instead of a second server call.
        dashboard: getDashboard(period),
        isLatest: row === sheet.getLastRow(),
        cashChanged:
            before.cash !== clean.cash ||
            before.cashWithdrawal !== clean.cashWithdrawal,
    };
}

const SALES_EDIT_LOG_SHEET = "Sales Edit Log";
const SALES_EDIT_LOG_HEADERS = [
    "Date",
    "Time",
    "Report Date",
    "Editor",
    "Field",
    "Old Value",
    "New Value",
];

function getOrCreateSalesEditLogSheet_() {
    const ss = SpreadsheetApp.getActive();
    let sheet = ss.getSheetByName(SALES_EDIT_LOG_SHEET);

    if (!sheet) {
        sheet = ss.insertSheet(SALES_EDIT_LOG_SHEET);
        sheet
            .getRange(1, 1, 1, SALES_EDIT_LOG_HEADERS.length)
            .setValues([SALES_EDIT_LOG_HEADERS])
            .setFontWeight("bold");
        sheet.setFrozenRows(1);
    }

    return sheet;
}

// Active user identity isn't always available depending on the
// deployment's access settings -- log anonymously rather than fail
// the whole edit/delete over it.
function currentEditorEmail_() {
    try {
        return Session.getActiveUser().getEmail() || "unknown";
    } catch (e) {
        return "unknown";
    }
}

// One row per changed field, so what actually changed is readable at a
// glance without diffing two full report snapshots by hand -- same
// get-or-create-sheet convention as DailyEntryLog.gs's logDailyEntry_().
function logSalesEdit_(reportDate, before, after) {
    const fields = [
        ["cash", "Closing Cash"],
        ["creditInvoices", "Credit Invoices"],
        ["payments", "Payments"],
        ["dailyExpense", "Daily Expense"],
        ["otherExpenses", "Other Expenses"],
        ["customerPayments", "Customer Payments"],
        ["cashWithdrawal", "Cash Withdrawal"],
        ["withdrawalNote", "Withdrawal Note"],
        ["cashDeposit", "Cash Deposit"],
        ["depositNote", "Deposit Note"],
        ["totalSales", "Total Sales"],
    ];

    const changed = fields.filter(
        ([key]) => String(before[key]) !== String(after[key]),
    );

    if (!changed.length) return;

    const sheet = getOrCreateSalesEditLogSheet_();
    const now = new Date();
    const editor = currentEditorEmail_();

    const rows = changed.map(([key, label]) => [
        Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd"),
        Utilities.formatDate(now, Session.getScriptTimeZone(), "HH:mm:ss"),
        reportDate,
        editor,
        label,
        before[key],
        after[key],
    ]);

    sheet
        .getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length)
        .setValues(rows);
}

// Serialized the same way updateReport()/saveReport() are, for the same
// reason: the row lookup and the write can't be allowed to race a retry.
function deleteReport(dateStr) {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
        return deleteReportLocked_(dateStr);
    } finally {
        lock.releaseLock();
    }
}

function deleteReportLocked_(dateStr) {
    const sheet = SpreadsheetApp.getActive().getSheetByName(
        CONFIG.SHEETS.SALES,
    );

    const row = findSalesRowByDate_(sheet, dateStr);

    if (!row) {
        throw new Error(
            "This report (" +
                dateStr +
                ") no longer exists in the Sales sheet -- it may have " +
                "already been deleted.",
        );
    }

    const before = readReportForEdit_(sheet, row);
    const isLatest = row === sheet.getLastRow();

    sheet.deleteRow(row);
    logSalesDelete_(dateStr, before);

    const period = Utilities.formatDate(
        new Date(dateStr),
        Session.getScriptTimeZone(),
        "yyyy-MM",
    );

    return {
        dashboard: getDashboard(period),
        isLatest,
        // Same chain concern as updateReport()'s cashChanged: only Closing
        // Cash/Cash Withdrawal feed the next row's Starting Cash snapshot
        // (see getStartingCash()).
        hadCashImpact: before.cash !== 0 || before.cashWithdrawal !== 0,
    };
}

// A single summary row rather than one row per field -- for a whole-record
// delete "old value" is naturally the whole record, and ten rows reading
// "X -> (deleted)" would be noise compared to the per-field diff a real
// edit gets from logSalesEdit_() above.
function logSalesDelete_(reportDate, before) {
    const sheet = getOrCreateSalesEditLogSheet_();
    const now = new Date();

    const summary =
        "Cash:" +
        before.cash +
        " Credit:" +
        before.creditInvoices +
        " Payments:" +
        (before.payments || "-") +
        " DailyExp:" +
        before.dailyExpense +
        " OtherExp:" +
        before.otherExpenses +
        " CustPay:" +
        before.customerPayments +
        " Withdrawal:" +
        before.cashWithdrawal +
        " Deposit:" +
        before.cashDeposit +
        " Total:" +
        before.totalSales;

    sheet.appendRow([
        Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd"),
        Utilities.formatDate(now, Session.getScriptTimeZone(), "HH:mm:ss"),
        reportDate,
        currentEditorEmail_(),
        "(entire report)",
        summary,
        "DELETED",
    ]);
}

// True if any row already in the Sales sheet is for `dateStr` (yyyy-MM-dd).
function salesDateExists_(sheet, dateStr) {
    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) return false;

    const tz = Session.getScriptTimeZone();

    return sheet
        .getRange(2, 1, lastRow - 1, 1)
        .getValues()
        .some(
            ([value]) =>
                value instanceof Date &&
                Utilities.formatDate(value, tz, "yyyy-MM-dd") === dateStr,
        );
}

function saveReport(data) {
    // Serialize saves so a double-click/retry can't slip a second row in
    // between the duplicate check and the write below.
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
        return saveReportLocked_(data);
    } finally {
        lock.releaseLock();
    }
}

function saveReportLocked_(data) {
    const sheet = SpreadsheetApp.getActive().getSheetByName(
        CONFIG.SHEETS.SALES,
    );

    if (salesDateExists_(sheet, data.date)) {
        throw new Error(
            "A report for " +
                data.date +
                " already exists in the Sales sheet, so this one was not saved.",
        );
    }

    const paymentInfo = calculatePayments(data.payments);

    const totalSales = calculateTotalSales(data);

    const row = sheet.getLastRow() + 1;

    sheet.getRange(row, 1, 1, 14).setValues([
        [
            new Date(data.date), // A Date
            Number(data.cash) || 0, // B Closing Cash
            Number(data.creditInvoices) || 0, // C Credit
            paymentInfo.count, // D Payment Count
            data.payments ? "=" + data.payments : "", // E Payments
            Number(data.dailyExpense) || 0, // F Daily Expense
            Number(data.otherExpenses) || 0, // G Other Expense
            -(Number(data.customerPayments) || 0), // H Client Payments
            Number(data.cashWithdrawal) || 0, // I Cash Withdrawal
            -(Number(data.cashDeposit) || 0), // J Cash Deposit
            -(Number(data.startingCash) || 0), // K Starting Cash
            totalSales, // L Total Sales
            data.withdrawalNote || "", // M Withdrawal Note
            data.depositNote || "", // N Deposit Note
        ],
    ]);

    return true;
}
