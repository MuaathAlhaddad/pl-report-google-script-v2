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

function getExpenses(period) {
    const values = getExpenseRows();

    let total = 0;

    for (let i = 1; i < values.length; i++) {
        if (periodToString(values[i][COL.PERIOD]) !== period) continue;

        total += Number(values[i][COL.AMOUNT]) || 0;
    }

    return total;
}

function getExpenseDashboard(period) {
    return {
        total: getExpenses(period),

        categories: getExpenseCategories(period),

        details: getExpenseDetails(period),

        exists: expensesExist(period),
    };
}

function getExpenseCategories(period) {
    const values = getExpenseRows();

    const result = {};

    for (let i = 1; i < values.length; i++) {
        if (periodToString(values[i][COL.PERIOD]) != period) continue;

        const category = values[i][COL.CATEGORY];

        result[category] =
            (result[category] || 0) + Number(values[i][COL.AMOUNT] || 0);
    }

    return result;
}

function getExpenseDetails(period) {
    const values = getExpenseRows();

    return values

        .slice(1)

        .filter((r) => periodToString(r[0]) == period)

        .map((r) => ({
            category: r[1],

            subcategory: r[2],

            account: r[3],

            amount: Number(r[4]),
        }));
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

    const values = getExpenseRows();

    const expenses = [];

    for (let i = 1; i < values.length; i++) {
        if (periodToString(values[i][COL.PERIOD]) != previous) continue;

        expenses.push({
            category: values[i][COL.CATEGORY],

            subcategory: values[i][COL.SUBCATEGORY],

            account: values[i][COL.ACCOUNT],

            amount: Number(values[i][COL.AMOUNT]) || 0,
        });
    }

    return expenses;
}

function expensesExist(period) {
    const values = getExpenseRows();

    for (let i = 1; i < values.length; i++) {
        if (periodToString(values[i][COL.PERIOD]) === period) {
            return true;
        }
    }

    return false;
}

function getExpenseWizard(period) {
    return {
        setup: getExpenseSetup(),

        values: getPreviousMonthExpenses(period),

        exists: expensesExist(period),
    };
}

function getExpenseRows() {
    const sheet = SpreadsheetApp.getActive().getSheetByName(
        CONFIG.SHEETS.EXPENSES,
    );

    return sheet.getDataRange().getValues();
}
