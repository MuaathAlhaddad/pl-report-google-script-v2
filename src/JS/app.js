const APP = {
    period: "",

    currentTab: "sales",
};

window.onload = function () {
    initialize();
};
function initialize() {
    const input = document.getElementById("periodSelector");

    const today = new Date();

    APP.period =
        today.getFullYear() +
        "-" +
        String(today.getMonth() + 1).padStart(2, "0");

    input.value = APP.period;

    input.onchange = function () {
        APP.period = this.value;

        if (APP.currentTab == "sales") {
            loadSalesDashboard();
        } else {
            loadExpenseDashboard();
        }
    };

    loadSalesDashboard();
}

function initializeSalesForm() {
    google.script.run

        .withSuccessHandler(fillForm)

        .getNewReportData();
}

function fillForm(data) {
    document.getElementById("date").value = data.date ?? "";

    document.getElementById("startingCash").value = data.startingCash ?? 0;

    document.getElementById("cash").value = data.cash ?? 0;

    document.getElementById("creditInvoices").value = data.creditInvoices ?? 0;

    document.getElementById("payments").value = data.payments ?? "";

    document.getElementById("otherExpenses").value = data.otherExpenses ?? 0;

    document.getElementById("customerPayments").value =
        data.customerPayments ?? 0;

    document.getElementById("cashWithdrawal").value = data.cashWithdrawal ?? 0;

    document.getElementById("cashDeposit").value = data.cashDeposit ?? 0;

    const expense = data.dailyExpense ?? 285;

    document.getElementById("dailyExpense").value = expense;

    document.querySelectorAll(".expense-card").forEach((card) => {
        card.classList.toggle(
            "selected",
            Number(card.dataset.value) === expense,
        );
    });

    updatePayments();
}

function selectExpense(card, value) {
    document
        .querySelectorAll(".expense-card")
        .forEach((c) => c.classList.remove("selected"));

    card.classList.add("selected");

    document.getElementById("dailyExpense").value = value;
}

function submitData() {
    const paymentInfo = calculatePaymentsPreview();

    const data = {
        date: document.getElementById("date").value,

        cash: Number(document.getElementById("cash").value) || 0,

        creditInvoices:
            Number(document.getElementById("creditInvoices").value) || 0,

        payments: paymentInfo.expression,

        dailyExpense:
            Number(document.getElementById("dailyExpense").value) || 0,

        otherExpenses:
            Number(document.getElementById("otherExpenses").value) || 0,

        customerPayments:
            Number(document.getElementById("customerPayments").value) || 0,

        cashWithdrawal:
            Number(document.getElementById("cashWithdrawal").value) || 0,

        cashDeposit: Number(document.getElementById("cashDeposit").value) || 0,

        startingCash:
            Number(document.getElementById("startingCash").value) || 0,
    };

    google.script.run
        .withSuccessHandler(showDashboard)
        .withFailureHandler(showError)
        .saveReport(data);
}

function calculatePaymentsPreview() {
    const expression = document.getElementById("payments").value.trim();

    if (!expression) {
        return {
            expression: "",
            total: 0,
            count: 0,
        };
    }

    const numbers = expression.split("+").map((x) => Number(x.trim()) || 0);

    return {
        expression,
        total: numbers.reduce((a, b) => a + b, 0),
        count: numbers.length,
    };
}

function updatePayments() {
    const paymentInfo = calculatePaymentsPreview();

    document.getElementById("paymentsInfo").innerHTML =
        `Payments: <b>${paymentInfo.count}</b> &nbsp; | &nbsp;
         Total: <b>${money(paymentInfo.total)}</b>`;
}
