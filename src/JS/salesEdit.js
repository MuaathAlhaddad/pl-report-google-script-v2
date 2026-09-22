const SALES_EDIT = {
    originalDate: null,
    initialSnapshot: null,
    saving: false,
};

function openEditModal(isoDate) {
    showLoading();

    gsRun("getReportForEdit", isoDate)
        .then(function (report) {
            hideLoading();

            fillEditForm(report);
            SALES_EDIT.originalDate = isoDate;
            SALES_EDIT.saving = false;
            SALES_EDIT.initialSnapshot = readEditFormSnapshot();

            document.getElementById("editModalOverlay").classList.add("open");
            document.getElementById("editCash").focus();
        })
        .catch(function (err) {
            hideLoading();
            showError(err);
        });
}

function fillEditForm(report) {
    document.getElementById("editDateBadge").textContent =
        formatEditDateBadge(report.date);
    document.getElementById("editDateDisplay").value = report.date;
    document.getElementById("editStartingCash").value = report.startingCash;

    document.getElementById("editCash").value = report.cash;
    document.getElementById("editCreditInvoices").value =
        report.creditInvoices;
    document.getElementById("editCustomerPayments").value =
        report.customerPayments;
    document.getElementById("editOtherExpenses").value = report.otherExpenses;
    document.getElementById("editPayments").value = report.payments;

    document.getElementById("editCashWithdrawal").value =
        report.cashWithdrawal;
    document.getElementById("editWithdrawalNote").value =
        report.withdrawalNote;
    document.getElementById("editCashDeposit").value = report.cashDeposit;
    document.getElementById("editDepositNote").value = report.depositNote;

    const expense = Number(report.dailyExpense) || 285;
    document.getElementById("editDailyExpense").value = expense;

    document
        .querySelectorAll("#editExpenseCards .expense-card")
        .forEach(function (card) {
            card.classList.toggle(
                "selected",
                Number(card.dataset.value) === expense,
            );
        });

    toggleEditNoteField("editCashWithdrawal", "editWithdrawalNoteGroup");
    toggleEditNoteField("editCashDeposit", "editDepositNoteGroup");
    updateEditPaymentsPreview();
    clearEditErrors();
}

function formatEditDateBadge(isoDate) {
    const d = new Date(isoDate + "T00:00:00");

    return d.toLocaleDateString("en-US", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

function selectEditExpense(card, value) {
    document
        .querySelectorAll("#editExpenseCards .expense-card")
        .forEach((c) => c.classList.remove("selected"));

    card.classList.add("selected");
    document.getElementById("editDailyExpense").value = value;
}

function toggleEditNoteField(amountId, noteGroupId) {
    const amount = Number(document.getElementById(amountId).value) || 0;
    document.getElementById(noteGroupId).style.display =
        amount !== 0 ? "block" : "none";
}

function updateEditPaymentsPreview() {
    const expression = document.getElementById("editPayments").value.trim();

    const info = expression
        ? {
              count: expression.split("+").length,
              total: expression
                  .split("+")
                  .reduce((a, b) => a + (Number(b.trim()) || 0), 0),
          }
        : { count: 0, total: 0 };

    document.getElementById("editPaymentsInfo").innerHTML =
        `Payments: <b>${info.count}</b> &nbsp; | &nbsp; Total: <b>${money(info.total)}</b>`;
}

function readEditFormFields() {
    return {
        cash: document.getElementById("editCash").value,
        creditInvoices: document.getElementById("editCreditInvoices").value,
        customerPayments: document.getElementById("editCustomerPayments")
            .value,
        otherExpenses: document.getElementById("editOtherExpenses").value,
        payments: document.getElementById("editPayments").value.trim(),
        dailyExpense: document.getElementById("editDailyExpense").value,
        cashWithdrawal: document.getElementById("editCashWithdrawal").value,
        withdrawalNote: document
            .getElementById("editWithdrawalNote")
            .value.trim(),
        cashDeposit: document.getElementById("editCashDeposit").value,
        depositNote: document.getElementById("editDepositNote").value.trim(),
    };
}

function readEditFormSnapshot() {
    return JSON.stringify(readEditFormFields());
}

function isEditFormDirty() {
    return readEditFormSnapshot() !== SALES_EDIT.initialSnapshot;
}

// [fieldKey, input id suffix, label] -- id suffix capitalizes fieldKey so
// e.g. "cashWithdrawal" maps to #editCashWithdrawal / #editCashWithdrawalError.
const EDIT_NUMBER_FIELDS = [
    ["cash", "Closing Cash"],
    ["creditInvoices", "Credit Invoices"],
    ["customerPayments", "Customer Payments"],
    ["otherExpenses", "Other Expenses"],
    ["cashWithdrawal", "Cash Withdrawal"],
    ["cashDeposit", "Cash Deposit"],
];

function editFieldId(key) {
    return "edit" + key.charAt(0).toUpperCase() + key.slice(1);
}

function clearEditErrors() {
    document
        .querySelectorAll("#editModalOverlay .fieldError")
        .forEach((el) => {
            el.classList.remove("show");
            el.textContent = "";
        });

    document
        .querySelectorAll("#editModalOverlay .formFieldGroup")
        .forEach((el) => el.classList.remove("hasError"));

    document.getElementById("editPayments").classList.remove("hasError");
}

function setEditFieldError(fieldId, message) {
    const input = document.getElementById(fieldId);
    const group = input.closest(".formFieldGroup");
    const errorEl = document.getElementById(fieldId + "Error");

    if (group) group.classList.add("hasError");
    else input.classList.add("hasError");

    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.add("show");
    }
}

function validateEditForm() {
    clearEditErrors();

    const fields = readEditFormFields();
    let firstInvalid = null;

    EDIT_NUMBER_FIELDS.forEach(([key, label]) => {
        const id = editFieldId(key);
        const raw = fields[key];
        const n = Number(raw);

        if (raw === "" || Number.isNaN(n)) {
            setEditFieldError(id, label + " is required.");
            firstInvalid = firstInvalid || id;
        } else if (n < 0) {
            setEditFieldError(id, label + " can't be negative.");
            firstInvalid = firstInvalid || id;
        }
    });

    if (
        fields.payments &&
        !/^\d+(\.\d+)?(\+\d+(\.\d+)?)*$/.test(fields.payments)
    ) {
        setEditFieldError(
            "editPayments",
            "Use numbers separated by +, like 500+300+1200.",
        );
        firstInvalid = firstInvalid || "editPayments";
    }

    if (firstInvalid) {
        document.getElementById(firstInvalid).focus();
        return null;
    }

    return fields;
}

function submitEditForm() {
    if (SALES_EDIT.saving) return;

    const fields = validateEditForm();
    if (!fields) return;

    SALES_EDIT.saving = true;

    const saveButton = document.getElementById("editSaveButton");
    saveButton.disabled = true;
    const originalLabel = saveButton.textContent;
    saveButton.textContent = "Saving…";

    gsRun("updateReport", SALES_EDIT.originalDate, fields)
        .then(function (result) {
            SALES_EDIT.saving = false;
            saveButton.disabled = false;
            saveButton.textContent = originalLabel;

            renderSalesDashboard(result.dashboard);
            closeEditModal();

            if (result.cashChanged && !result.isLatest) {
                alert(
                    "Saved. Note: this wasn't the most recent report, so " +
                        "later days' Starting Cash won't automatically " +
                        "update to match this change.",
                );
            }
        })
        .catch(function (err) {
            SALES_EDIT.saving = false;
            saveButton.disabled = false;
            saveButton.textContent = originalLabel;
            showError(err);
        });
}

function requestCloseEditModal() {
    if (
        SALES_EDIT.originalDate &&
        isEditFormDirty() &&
        !confirm("Discard your changes to this report?")
    ) {
        return;
    }

    closeEditModal();
}

function closeEditModal() {
    document.getElementById("editModalOverlay").classList.remove("open");
    SALES_EDIT.originalDate = null;
}

document.addEventListener("keydown", function (e) {
    if (
        e.key === "Escape" &&
        document.getElementById("editModalOverlay").classList.contains("open")
    ) {
        requestCloseEditModal();
    }
});

document.addEventListener("click", function (e) {
    if (e.target && e.target.id === "editModalOverlay") {
        requestCloseEditModal();
    }
});
