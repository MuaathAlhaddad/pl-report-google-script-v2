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

    document
        .querySelectorAll(".tab")
        .forEach((t) => t.classList.remove("active"));

    document.getElementById(tab + "Tab").classList.add("active");

    if (tab == "dashboard") loadInsightsDashboard();
    else if (tab == "sales") loadSalesDashboard();
    else loadExpenseDashboard();
}

function showSalesForm() {
    document.getElementById("salesFormPage").style.display = "block";
    document.getElementById("mainPage").style.display = "none";
    initializeSalesForm();
}

function showExpenseWizard() {
    document.getElementById("expenseDashboard").style.display = "none";
    document.getElementById("expenseWizard").style.display = "block";
    createExpensesWizard();
}
