function getYearlyInsights(year) {
    const months = [];
    for (let m = 1; m <= 12; m++) months.push(String(m).padStart(2, "0"));

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1; // 1-12

    // Read each sheet exactly once and aggregate all 24 months (current +
    // previous year) from the in-memory rows, instead of re-reading the
    // whole sheet per month via getSummary()/getExpenses().
    const salesByPeriod = sumFieldByPeriod(getAllSalesRows(), "totalSales");
    const expensesByPeriod = sumFieldByPeriod(getAllExpenseRows(), "amount");

    const currentSales = [], currentExpenses = [];
    const previousSales = [], previousExpenses = [];

    months.forEach((m) => {
        const monthNum = Number(m);
        const curPeriod = year + "-" + m;
        const prevPeriod = (year - 1) + "-" + m;

        // Don't compute/show future months for the current year
        const isFutureMonth = year === currentYear && monthNum > currentMonth;

        currentSales.push(isFutureMonth ? null : salesByPeriod[curPeriod] || 0);
        currentExpenses.push(
            isFutureMonth ? null : expensesByPeriod[curPeriod] || 0,
        );

        previousSales.push(salesByPeriod[prevPeriod] || 0);
        previousExpenses.push(expensesByPeriod[prevPeriod] || 0);
    });

    return {
        year,
        months,
        currentSales,
        currentExpenses,
        previousSales,
        previousExpenses,
        totals: getYearTotals(year, salesByPeriod, expensesByPeriod),
    };
}

function getYearTotals(year, salesByPeriod, expensesByPeriod) {
    salesByPeriod =
        salesByPeriod || sumFieldByPeriod(getAllSalesRows(), "totalSales");
    expensesByPeriod =
        expensesByPeriod || sumFieldByPeriod(getAllExpenseRows(), "amount");

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;

    const lastMonth = year === currentYear ? currentMonth : 12;

    let sales = 0, expenses = 0;

    for (let m = 1; m <= lastMonth; m++) {
        const period = year + "-" + String(m).padStart(2, "0");
        sales += salesByPeriod[period] || 0;
        expenses += expensesByPeriod[period] || 0;
    }

    const profit = sales * CONFIG.PROFIT_MARGIN;

    return { sales, expenses, profit, netProfit: profit - expenses };
}

function sumFieldByPeriod(rows, field, periodField) {
    periodField = periodField || "period";

    const map = {};

    rows.forEach((r) => {
        map[r[periodField]] = (map[r[periodField]] || 0) + r[field];
    });

    return map;
}
