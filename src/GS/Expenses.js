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
    const sheet = SpreadsheetApp.getActive().getSheetByName(
        CONFIG.SHEETS.EXPENSES,
    );

    const values = sheet.getDataRange().getValues();

    let total = 0;

    for (let i = 1; i < values.length; i++) {
        const rowPeriod = Utilities.formatDate(
            new Date(values[i][0]),
            Session.getScriptTimeZone(),
            "yyyy-MM",
        );

        if (rowPeriod === period) {
            total += Number(values[i][5]) || 0;
        }
    }

    return total;
}

function getPreviousMonthExpenses(period) {
    const previous = getPreviousPeriod(period);

    const sheet = SpreadsheetApp.getActive().getSheetByName(
        CONFIG.SHEETS.EXPENSES,
    );

    const values = sheet.getDataRange().getValues();

    const expenses = [];

    for (let i = 1; i < values.length; i++) {
        const rowPeriod = periodToString(values[i][0]);

        if (rowPeriod != previous) continue;

        expenses.push({
            category: values[i][1],

            subcategory: values[i][2],

            account: values[i][3],

            amount: Number(values[i][4]) || 0,
        });
    }

    return expenses;
}

function getPreviousPeriod(period) {
    const [year, month] = period.split("-").map(Number);

    const d = new Date(year, month - 2, 1);

    return Utilities.formatDate(
        d,

        Session.getScriptTimeZone(),

        "yyyy-MM",
    );
}

function expensesExist(period) {
    const sheet = SpreadsheetApp.getActive().getSheetByName(
        CONFIG.SHEETS.EXPENSES,
    );

    const values = sheet.getDataRange().getValues();

    for (let i = 1; i < values.length; i++) {
        if (periodToString(values[i][0]) == period) return true;
    }

    return false;
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
    const sheet = SpreadsheetApp.getActive().getSheetByName(
        CONFIG.SHEETS.EXPENSES,
    );

    const values = sheet.getDataRange().getValues();

    const result = {};

    for (let i = 1; i < values.length; i++) {
        if (periodToString(values[i][0]) != period) continue;

        const category = values[i][1];

        result[category] = (result[category] || 0) + Number(values[i][4] || 0);
    }

    return result;
}

function getExpenseDetails(period) {
    const sheet = SpreadsheetApp.getActive().getSheetByName(
        CONFIG.SHEETS.EXPENSES,
    );

    const values = sheet.getDataRange().getValues();

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

function getExpenseWizard(period) {
    return {
        setup: getExpenseSetup(),

        values: getPreviousMonthExpenses(period),

        exists: expensesExist(period),
    };
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

    const sheet = SpreadsheetApp.getActive().getSheetByName(
        CONFIG.SHEETS.EXPENSES,
    );

    const values = sheet.getDataRange().getValues();

    const expenses = [];

    for (let i = 1; i < values.length; i++) {
        if (periodToString(values[i][0]) != previous) continue;

        expenses.push({
            category: values[i][1],

            subcategory: values[i][2],

            account: values[i][3],

            amount: Number(values[i][4]) || 0,
        });
    }

    return expenses;
}

function expensesExist(period) {
    const sheet = SpreadsheetApp.getActive().getSheetByName(
        CONFIG.SHEETS.EXPENSES,
    );

    const values = sheet.getDataRange().getValues();

    for (let i = 1; i < values.length; i++) {
        if (periodToString(values[i][0]) === period) {
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
