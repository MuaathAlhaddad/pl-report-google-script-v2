function getDashboard(period){

    const summary = getSummary(period);

    const expenses = getExpenses(period);

    const goal = getGoal(period);

    const profit = summary.monthSales * CONFIG.PROFIT_MARGIN;

    return{

        summary,

        goal,

        expenses,

        profit,

        netProfit: profit - expenses,

        sales: getSales(period)

    };

}




function getSales(period){

  const sheet = SpreadsheetApp.getActive()
    .getSheetByName(CONFIG.SHEETS.SALES);

  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) return [];

  const sales = [];

  for (let i = 1; i < values.length; i++) {

    const row = values[i];

    if (!(row[0] instanceof Date)) continue;

    const date = new Date(row[0]);

    const rowPeriod = Utilities.formatDate(
        date,
        Session.getScriptTimeZone(),
        "yyyy-MM"
    );

    if(rowPeriod != period)
    continue;

    sales.push({

      row: i + 1,

      date: formatDate(date),

      cash: Number(row[1]) || 0,

      creditInvoices: Number(row[2]) || 0,

      payments: Number(row[4]) || 0,

      dailyExpense: Number(row[5]) || 0,

      otherExpenses: Number(row[6]) || 0,

      customerPayments: Math.abs(Number(row[7])) || 0,

      cashWithdrawal: Number(row[8]) || 0,

      cashDeposit: Math.abs(Number(row[9])) || 0,

      totalSales: Number(row[11]) || 0 

    });

  }

  return sales;

}


function getSummary(period) {

    const sales = getSales(period);

    let monthSales = 0;
    let bestDay = 0;

    sales.forEach(r => {

        monthSales += r.totalSales;

        if (r.totalSales > bestDay)
            bestDay = r.totalSales;

    });

    return {

        monthSales,

        average: sales.length
            ? monthSales / sales.length
            : 0,

        bestDay

    };
}