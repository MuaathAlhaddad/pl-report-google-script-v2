function getDashboard(period) {
    const sales = getSales(period);
    const summary = summarizeSales(sales);

    const expenses = getExpenses(period);

    const goal = getGoal(period);

    const profit = summary.monthSales * CONFIG.PROFIT_MARGIN;

    return {
        summary,

        goal,

        expenses,

        profit,

        netProfit: profit - expenses,

        sales,
    };
}

// Reads the Sales sheet exactly once. Callers that need multiple periods
// (e.g. a whole year) should read this once and filter/aggregate in memory
// instead of calling getSales() per period, since each sheet read is a slow
// round trip.
function getAllSalesRows() {
    const sheet = SpreadsheetApp.getActive().getSheetByName(
        CONFIG.SHEETS.SALES,
    );

    const values = sheet.getDataRange().getValues();
    const tz = Session.getScriptTimeZone();

    const rows = [];

    for (let i = 1; i < values.length; i++) {
        const raw = values[i];

        if (!(raw[0] instanceof Date)) continue;

        rows.push({
            row: i + 1,

            date: raw[0],

            period: Utilities.formatDate(raw[0], tz, "yyyy-MM"),

            cash: Number(raw[1]) || 0,

            creditInvoices: Number(raw[2]) || 0,

            payments: Number(raw[4]) || 0,

            dailyExpense: Number(raw[5]) || 0,

            otherExpenses: Number(raw[6]) || 0,

            customerPayments: Math.abs(Number(raw[7])) || 0,

            cashWithdrawal: Number(raw[8]) || 0,

            cashDeposit: Math.abs(Number(raw[9])) || 0,

            totalSales: Number(raw[11]) || 0,
        });
    }

    return rows;
}

function getSales(period) {
    return getAllSalesRows()
        .filter((r) => r.period === period)
        .map((r) => Object.assign({}, r, { date: formatDate(r.date) }));
}

function getSummary(period) {
    return summarizeSales(getSales(period));
}

function summarizeSales(sales) {
    let monthSales = 0;
    let bestDay = 0;

    sales.forEach((r) => {
        monthSales += r.totalSales;

        if (r.totalSales > bestDay) bestDay = r.totalSales;
    });

    return {
        monthSales,

        average: sales.length ? monthSales / sales.length : 0,

        bestDay,
    };
}
