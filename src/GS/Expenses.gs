const COL = {
    PERIOD: 0,

    CATEGORY: 1,

    SUBCATEGORY: 2,

    ACCOUNT: 3,

    AMOUNT: 4,

    REMARKS: 5,
};

function saveExpenses(data) {
    const period = data.period;

    const expenses = data.expenses;

    const sheet = SpreadsheetApp.getActive().getSheetByName(
        CONFIG.SHEETS.EXPENSES,
    );

    const rows = [];

    expenses.forEach((e) => {
        if (!e.amount) return;

        rows.push([period, e.category, e.subcategory, e.account, e.amount, ""]);
    });

    if (rows.length) {
        sheet
            .getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length)
            .setValues(rows);
    }
}

// Reads the Expenses sheet exactly once. Callers that need several periods
// or several breakdowns of the same period should read this once and derive
// everything from it in memory instead of re-reading per period/breakdown,
// since each sheet read is a slow round trip.
function getAllExpenseRows() {
    const sheet = SpreadsheetApp.getActive().getSheetByName(
        CONFIG.SHEETS.EXPENSES,
    );

    const values = sheet.getDataRange().getValues();
    const hijriFormatter = createHijriFormatter();

    const rows = [];

    for (let i = 1; i < values.length; i++) {
        rows.push({
            period: periodToString(values[i][COL.PERIOD]),

            hijriPeriod: formatHijriPeriod(
                hijriFormatter,
                new Date(values[i][COL.PERIOD]),
            ),

            category: values[i][COL.CATEGORY],

            subcategory: values[i][COL.SUBCATEGORY],

            account: values[i][COL.ACCOUNT],

            amount: Number(values[i][COL.AMOUNT]) || 0,
        });
    }

    return rows;
}

function getExpenses(period) {
    return sumExpenseRows(getRowsForPeriod(getAllExpenseRows(), period));
}

function getExpenseDashboard(period) {
    const rows = getRowsForPeriod(getAllExpenseRows(), period);

    return {
        total: sumExpenseRows(rows),

        categories: categorizeExpenseRows(rows),

        details: toExpenseDetails(rows),

        exists: rows.length > 0,
    };
}

function getExpenseCategories(period) {
    return categorizeExpenseRows(getRowsForPeriod(getAllExpenseRows(), period));
}

function getExpenseDetails(period) {
    return toExpenseDetails(getRowsForPeriod(getAllExpenseRows(), period));
}

function getExpenseSubcategories(period) {
    const result = {};

    getRowsForPeriod(getAllExpenseRows(), period).forEach((r) => {
        const key = r.category + " – " + r.subcategory;

        result[key] = (result[key] || 0) + r.amount;
    });

    return result;
}

function periodToString(date) {
    return Utilities.formatDate(
        new Date(date),
        Session.getScriptTimeZone(),
        "yyyy-MM",
    );
}

function getPreviousPeriod(period) {
    const [year, month] = period.split("-").map(Number);

    const d = new Date(year, month - 2, 1);

    return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM");
}

function getPreviousMonthExpenses(period) {
    const previous = getPreviousPeriod(period);

    return toExpenseDetails(getRowsForPeriod(getAllExpenseRows(), previous));
}

function expensesExist(period) {
    return getRowsForPeriod(getAllExpenseRows(), period).length > 0;
}

function getExpenseWizard(period) {
    const rows = getAllExpenseRows();

    return {
        setup: getExpenseSetup(),

        values: toExpenseDetails(
            getRowsForPeriod(rows, getPreviousPeriod(period)),
        ),

        exists: getRowsForPeriod(rows, period).length > 0,
    };
}

function getRowsForPeriod(rows, period) {
    return rows.filter((r) => r.period === period);
}

function sumExpenseRows(rows) {
    return rows.reduce((total, r) => total + r.amount, 0);
}

function categorizeExpenseRows(rows) {
    const result = {};

    rows.forEach((r) => {
        result[r.category] = (result[r.category] || 0) + r.amount;
    });

    return result;
}

function toExpenseDetails(rows) {
    return rows.map((r) => ({
        category: r.category,

        subcategory: r.subcategory,

        account: r.account,

        amount: r.amount,
    }));
}
