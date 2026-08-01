function getGoal(period) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.GOALS);

  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    const rowPeriod = Utilities.formatDate(
      new Date(values[i][0]),
      Session.getScriptTimeZone(),
      "yyyy-MM",
    );

    if (rowPeriod === period) {
      return Number(values[i][1]) || 0;
    }
  }

  return 0;
}
