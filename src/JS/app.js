const APP = {
    period: "",
    currentTab: "dashboard",
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

        // Bulk Invoice/Bulk Payment have no period filter (they're always
        // "right now"), so a month change while on either tab is a no-op
        // rather than reloading it.
        if (APP.currentTab == "sales") loadSalesDashboard();
        else if (APP.currentTab == "expenses") loadExpenseDashboard();
        else if (APP.currentTab == "dashboard") loadInsightsDashboard();
    };

    // Sales form is what you actually need open every night -- land there
    // directly instead of on the dashboard. "Cancel" on the form still
    // takes you to the dashboard via showDashboard(), which is unchanged.
    showSalesForm();
}

function initializeSalesForm() {
    showLoading();

    google.script.run
        .withSuccessHandler(function (data) {
            fillForm(data);
            hideLoading();

            if (data.daftraErrors && data.daftraErrors.length) {
                alert(
                    "Some fields couldn't auto-fill from Daftra, please check them:\n\n" +
                        data.daftraErrors.join("\n"),
                );
            }
        })
        .withFailureHandler(function (err) {
            hideLoading();
            showError(err);
        })
        .getNewReportData();
}

// Fields that come pre-filled from Daftra: shown as read-only text by
// default (see .editableField in sales-form.html) so the form reads clean,
// with the real <input> revealed via double-click for a quick correction.
const AUTO_FILL_FIELDS = ["creditInvoices", "otherExpenses", "customerPayments"];

function fillForm(data) {
    document.getElementById("date").value = data.date ?? "";

    if (data.date) {
        document.getElementById("formPeriod").innerHTML = formatPeriod(
            data.date.slice(0, 7),
        );
    }

    document.getElementById("startingCash").value = data.startingCash ?? 0;

    document.getElementById("cash").value = data.cash ?? 0;

    document.getElementById("creditInvoices").value = data.creditInvoices ?? 0;

    document.getElementById("payments").value = data.payments ?? "";

    document.getElementById("otherExpenses").value = data.otherExpenses ?? 0;

    document.getElementById("customerPayments").value =
        data.customerPayments ?? 0;

    AUTO_FILL_FIELDS.forEach(showFieldDisplay);

    document.getElementById("cashWithdrawal").value = data.cashWithdrawal ?? 0;

    toggleNoteField("cashWithdrawal", "withdrawalNoteGroup");

    document.getElementById("withdrawalNote").value = data.withdrawalNote ?? "";

    document.getElementById("cashDeposit").value = data.cashDeposit ?? 0;

    toggleNoteField("cashDeposit", "depositNoteGroup");

    document.getElementById("depositNote").value = data.depositNote ?? "";

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

// --- Editable display fields (Credit Invoices, Other Expenses, Customer
// Payments) -- shown as plain text pulled from Daftra; double-click swaps
// in the real number input so you can correct it if it's ever wrong. ---

function fieldWrapper(id) {
    return document.querySelector(`.editableField[data-field="${id}"]`);
}

function showFieldDisplay(id) {
    const wrapper = fieldWrapper(id);
    if (!wrapper) return;

    const input = document.getElementById(id);

    wrapper.querySelector(".fieldValue").textContent = money(
        Number(input.value) || 0,
    );

    wrapper.querySelector(".fieldDisplay").style.display = "flex";
    input.style.display = "none";
}

function editField(id) {
    const wrapper = fieldWrapper(id);
    if (!wrapper) return;

    wrapper.querySelector(".fieldDisplay").style.display = "none";

    const input = document.getElementById(id);
    input.style.display = "block";
    input.focus();
    input.select();
}

function doneEditingField(id) {
    showFieldDisplay(id);
}

// --- Withdrawal/Deposit notes -- only worth asking "where did it go /
// come from" once there's actually an amount to explain. ---

function toggleNoteField(amountId, noteGroupId) {
    const amount = Number(document.getElementById(amountId).value) || 0;
    document.getElementById(noteGroupId).style.display =
        amount !== 0 ? "block" : "none";
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

        withdrawalNote: document.getElementById("withdrawalNote").value.trim(),

        cashDeposit: Number(document.getElementById("cashDeposit").value) || 0,

        depositNote: document.getElementById("depositNote").value.trim(),

        startingCash:
            Number(document.getElementById("startingCash").value) || 0,
    };

    // Disabled until the server answers, so a double-click can't submit the
    // same report twice.
    const saveButton = document.getElementById("saveButton");
    saveButton.disabled = true;

    google.script.run
        .withSuccessHandler(function () {
            saveButton.disabled = false;
            showDashboard();
        })
        .withFailureHandler(function (err) {
            saveButton.disabled = false;
            showError(err);
        })
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

// used for page header
function formatPeriod(period) {
    const [year, month] = period.split("-");

    const date = new Date(Number(year), Number(month) - 1);

    return date.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
    });
}
