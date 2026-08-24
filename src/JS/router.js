function showDashboard() {
    document.getElementById("salesFormPage").style.display = "none";
    document.getElementById("mainPage").style.display = "block";
    showTab(APP.currentTab);
}

function showTab(tab) {
    APP.currentTab = tab;

    document.getElementById("dashboardPage").style.display =
        tab == "dashboard" ? "block" : "none";

    document.getElementById("salesPage").style.display =
        tab == "sales" ? "block" : "none";

    document.getElementById("expensesPage").style.display =
        tab == "expenses" ? "block" : "none";

    document.getElementById("debtsPage").style.display =
        tab == "debts" ? "block" : "none";

    document.getElementById("bulkInvoicePage").style.display =
        tab == "bulkInvoice" ? "block" : "none";

    document
        .querySelectorAll(".tab")
        .forEach((t) => t.classList.remove("active"));

    document.getElementById(tab + "Tab").classList.add("active");

    if (tab == "dashboard") loadInsightsDashboard();
    else if (tab == "sales") loadSalesDashboard();
    else if (tab == "expenses") loadExpenseDashboard();
    else if (tab == "debts") loadDebtsPage();
    else if (tab == "bulkInvoice") loadBulkInvoicePage();
}

function showSalesForm() {
    document.getElementById("salesFormPage").style.display = "block";
    document.getElementById("mainPage").style.display = "none";
    initializeSalesForm();
}

// Quick jump straight to the Debts tab from anywhere (e.g. the link on the
// sales form) without going through the dashboard first.
function showDebts() {
    document.getElementById("salesFormPage").style.display = "none";
    document.getElementById("mainPage").style.display = "block";
    showTab("debts");
}

function showExpenseWizard() {
    document.getElementById("expenseDashboard").style.display = "none";
    document.getElementById("expenseWizard").style.display = "block";
    createExpensesWizard();
}
