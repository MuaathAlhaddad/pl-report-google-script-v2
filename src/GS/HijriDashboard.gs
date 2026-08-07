const HIJRI_MONTH_NAMES = [
    "محرم",
    "صفر",
    "ربيع الأول",
    "ربيع الآخر",
    "جمادى الأولى",
    "جمادى الآخرة",
    "رجب",
    "شعبان",
    "رمضان",
    "شوال",
    "ذو القعدة",
    "ذو الحجة",
];

// Takes a Gregorian "yyyy-MM" period (same shape as the rest of the
// dashboard) and reports the Hijri year that its 1st falls in, so the Hijri
// overview tracks the same month picker as everything else.
function getHijriYearlyInsights(period) {
    const months = [];
    for (let m = 1; m <= 12; m++) months.push(String(m).padStart(2, "0"));

    const [gy, gm] = period.split("-").map(Number);
    const anchorDate = new Date(gy, gm - 1, 1);
    const hijriYear = Number(getHijriPeriod(anchorDate).split("-")[0]);

    const [todayHijriYear, todayHijriMonth] = getHijriPeriod(new Date())
        .split("-")
        .map(Number);

    const salesByPeriod = sumFieldByPeriod(
        getAllSalesRows(),
        "totalSales",
        "hijriPeriod",
    );
    const expensesByPeriod = sumFieldByPeriod(
        getAllExpenseRows(),
        "amount",
        "hijriPeriod",
    );

    const currentSales = [], currentExpenses = [];
    const previousSales = [], previousExpenses = [];

    months.forEach((m) => {
        const monthNum = Number(m);
        const curPeriod = hijriYear + "-" + m;
        const prevPeriod = (hijriYear - 1) + "-" + m;

        // Don't compute/show future months for the current Hijri year
        const isFutureMonth =
            hijriYear === todayHijriYear && monthNum > todayHijriMonth;

        currentSales.push(isFutureMonth ? null : salesByPeriod[curPeriod] || 0);
        currentExpenses.push(
            isFutureMonth ? null : expensesByPeriod[curPeriod] || 0,
        );

        previousSales.push(salesByPeriod[prevPeriod] || 0);
        previousExpenses.push(expensesByPeriod[prevPeriod] || 0);
    });

    return {
        year: hijriYear,
        months,
        monthNames: HIJRI_MONTH_NAMES,
        currentSales,
        currentExpenses,
        previousSales,
        previousExpenses,
        totals: getHijriYearTotals(
            hijriYear,
            todayHijriYear,
            todayHijriMonth,
            salesByPeriod,
            expensesByPeriod,
        ),
    };
}

function getHijriYearTotals(
    hijriYear,
    todayHijriYear,
    todayHijriMonth,
    salesByPeriod,
    expensesByPeriod,
) {
    const lastMonth = hijriYear === todayHijriYear ? todayHijriMonth : 12;

    let sales = 0, expenses = 0;

    for (let m = 1; m <= lastMonth; m++) {
        const period = hijriYear + "-" + String(m).padStart(2, "0");
        sales += salesByPeriod[period] || 0;
        expenses += expensesByPeriod[period] || 0;
    }

    const profit = sales * CONFIG.PROFIT_MARGIN;

    return { sales, expenses, profit, netProfit: profit - expenses };
}
