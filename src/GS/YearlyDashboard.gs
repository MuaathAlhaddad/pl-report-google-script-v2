function getYearlyInsights(year) {
    const months = [];
    for (let m = 1; m <= 12; m++) months.push(String(m).padStart(2, "0"));

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1; // 1-12

    const currentSales = [], currentExpenses = [];
    const previousSales = [], previousExpenses = [];

    months.forEach((m) => {
        const monthNum = Number(m);
        const curPeriod = year + "-" + m;
        const prevPeriod = (year - 1) + "-" + m;

        // Don't compute/show future months for the current year
        const isFutureMonth = year === currentYear && monthNum > currentMonth;

        currentSales.push(isFutureMonth ? null : getSummary(curPeriod).monthSales);
        currentExpenses.push(isFutureMonth ? null : getExpenses(curPeriod));

        previousSales.push(getSummary(prevPeriod).monthSales);
        previousExpenses.push(getExpenses(prevPeriod));
    });

    return {
        year,
        months,
        currentSales,
        currentExpenses,
        previousSales,
        previousExpenses,
        totals: getYearTotals(year),
    };
}

function getYearTotals(year) {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;

    const lastMonth = year === currentYear ? currentMonth : 12;

    let sales = 0, expenses = 0;

    for (let m = 1; m <= lastMonth; m++) {
        const period = year + "-" + String(m).padStart(2, "0");
        sales += getSummary(period).monthSales;
        expenses += getExpenses(period);
    }

    const profit = sales * CONFIG.PROFIT_MARGIN;

    return { sales, expenses, profit, netProfit: profit - expenses };
}