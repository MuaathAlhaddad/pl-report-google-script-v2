function getNewReportData() {
  return {
    date: getNextDate(),
    startingCash: getStartingCash(),
    cash: 0,
    creditInvoices: 0,
    payments: "",
    dailyExpense: 285,
    otherExpenses: 0,
    customerPayments: 0,
    cashWithdrawal: 0,
    cashDeposit: 0,
  };
}

function getStartingCash() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.SALES);

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
  const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.SALES);

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

function saveReport(data) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.SALES);

  const paymentInfo = calculatePayments(data.payments);

  const totalSales = calculateTotalSales(data);

  const row = sheet.getLastRow() + 1;

  sheet.getRange(row, 1, 1, 12).setValues([
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
    ],
  ]);

  return true;
}
