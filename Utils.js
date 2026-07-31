function currency(number){

    return Number(number).toLocaleString();

}

function formatDate(date){

    return Utilities.formatDate(

        new Date(date),

        Session.getScriptTimeZone(),

        "dd/MM/yyyy"

    );

}


function formatMoney(value){

    return Number(value||0)

        .toLocaleString("en-US",{

            minimumFractionDigits:0,

            maximumFractionDigits:0

        });

}


function calculateTotalSales(data) {

    const paymentInfo = calculatePayments(data.payments);

    const closingCash      = Number(data.cash) || 0;
    const creditInvoices   = Number(data.creditInvoices) || 0;
    const dailyExpense     = Number(data.dailyExpense) || 0;
    const otherExpenses    = Number(data.otherExpenses) || 0;
    const customerPayments = Number(data.customerPayments) || 0;
    const cashDeposit      = Number(data.cashDeposit) || 0;
    const startingCash     = Number(data.startingCash) || 0;

    return (

        closingCash +
        creditInvoices +
        paymentInfo.total +
        dailyExpense +
        otherExpenses -
        customerPayments -
        cashDeposit -
        startingCash

    );

}

function getNextDate() {

    const sheet = SpreadsheetApp
        .getActive()
        .getSheetByName(CONFIG.SHEETS.SALES);

    const lastRow = sheet.getLastRow();

    // No reports yet
    if (lastRow <= 1) {

        return Utilities.formatDate(
            new Date(),
            Session.getScriptTimeZone(),
            "yyyy-MM-dd"
        );

    }

    const lastDate = sheet.getRange(lastRow, 1).getValue();

    if (!(lastDate instanceof Date)) {

        return Utilities.formatDate(
            new Date(),
            Session.getScriptTimeZone(),
            "yyyy-MM-dd"
        );

    }

    const nextDate = new Date(lastDate);
    nextDate.setDate(nextDate.getDate() + 1);

    return Utilities.formatDate(
        nextDate,
        Session.getScriptTimeZone(),
        "yyyy-MM-dd"
    );

}


function calculatePayments(expression){

    const exp = (expression || "").trim();

    if(!exp){

        return {
            total: 0,
            count: 0
        };

    }

    const numbers = exp
        .split("+")
        .map(x => Number(x.trim()) || 0);

    return {

        total: numbers.reduce((a,b)=>a+b,0),

        count: numbers.length

    };

}



