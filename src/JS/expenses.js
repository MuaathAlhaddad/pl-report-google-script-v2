let EXPENSE = {
    steps: [],

    current: 0,

    values: {},
};

function setExpenseValue(category, subcategory, account, amount) {
    amount = Number(amount) || 0;

    const item = EXPENSE.values.find(
        (e) =>
            e.category == category &&
            e.subcategory == subcategory &&
            e.account == account,
    );

    if (item) {
        item.amount = amount;
    } else {
        EXPENSE.values.push({
            category,

            subcategory,

            account,

            amount,
        });
    }
}

function createExpensesWizard() {
    showLoading();

    google.script.run
        .withSuccessHandler(function (data) {
            hideLoading();

            if (data.exists) {
                alert("Expenses for this month already exist.");
                return;
            }

            EXPENSE.steps = data.setup;
            EXPENSE.values = data.values;
            EXPENSE.current = 0;
            renderExpenseStep();
        })
        .withFailureHandler(function (err) {
            hideLoading();
            showError(err);
        })
        .getExpenseWizard(APP.period);
}

function loadExpenseDashboard() {
    showLoading();

    google.script.run
        .withSuccessHandler(function (data) {
            renderExpenseDashboard(data);
            hideLoading();
        })
        .withFailureHandler(function (err) {
            hideLoading();
            showError(err);
        })
        .getExpenseDashboard(APP.period);
}

function renderExpenseDashboard(data) {
    let html = `
    <div class="pageHeader">
        <div>
            <div class="pageTitle">📋 Expenses Dashboard</div>
            <div class="pageSubtitle">Monthly Expense Breakdown</div>
        </div>
        <div class="pagePeriod">${formatPeriod(APP.period)}</div>
    </div>
    `;

    if (!data.details.length) {
        html += `<div class="emptyState">No expenses recorded for ${formatPeriod(APP.period)} yet.</div>`;
    } else {
        const grouped = groupExpenseDetails(data.details);

        html += `<div class="expenseBreakdown">`;

        Object.keys(grouped).forEach((category) => {
            html += `
                <div class="expenseGroup">
                    <div class="expenseGroupHeader">
                        <span>${category}</span>
                        <span>${money(data.categories[category] || 0)}</span>
                    </div>
                    <table class="salesTable">
                        <thead>
                            <tr>
                                <th>Subcategory</th>
                                <th>Account</th>
                                <th>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            grouped[category].forEach((row) => {
                html += `
                    <tr>
                        <td>${row.subcategory}</td>
                        <td>${row.account || "-"}</td>
                        <td>${money(row.amount)}</td>
                    </tr>
                `;
            });

            html += `</tbody></table></div>`;
        });

        html += `</div>`;

        html += `
            <div class="expenseGrandTotal">
                Month Total <span>${money(data.total)}</span>
            </div>
        `;
    }

    if (!data.exists) {
        html += `
            <div style="margin-top:25px;text-align:right;">
                <button class="primaryButton" onclick="showExpenseWizard()">
                    ➕ Create Expenses
                </button>
            </div>
        `;
    } else {
        html += `
            <div style="margin-top:25px;color:#43A047;font-weight:bold;">
                ✓ Expenses already recorded for ${formatPeriod(APP.period)}.
            </div>
        `;
    }

    document.getElementById("expenseDashboard").innerHTML = html;
}

function groupExpenseDetails(details) {
    const grouped = {};
    details.forEach((d) => {
        if (!grouped[d.category]) grouped[d.category] = [];
        grouped[d.category].push(d);
    });
    return grouped;
}

function renderExpenseStep() {
    const step = EXPENSE.steps[EXPENSE.current];

    document.getElementById("expenseTitle").innerHTML = step.title;
    document.getElementById("expenseWizardPeriod").innerHTML = formatPeriod(
        APP.period,
    );

    let html = "";

    // ========= General Section =========

    if (step.general && step.general.length) {
        html += `
            <div class="expenseSection">

                <h2>عام</h2>
        `;

        step.general.forEach((name) => {
            html += `

                <div class="expenseRow">

                    <label>${name}</label>

                    <input
                        type="number"
                        value="${getExpenseValue(step.title, name, "")}"
                        oninput="
                            setExpenseValue(
                                '${step.title}',
                                '${name}',
                                '',
                                this.value
                            );
                            updateExpenseSummary();
                        ">

                </div>

            `;
        });

        html += "</div>";
    }

    // ========= Subcategory Sections =========

    if (step.sections) {
        step.sections.forEach((section) => {
            html += `

                <div class="expenseSection">

                    <h2>${section.title}</h2>

            `;

            section.accounts.forEach((account) => {
                html += `

                    <div class="expenseRow">

                        <label>${account}</label>

                        <input
                            type="number"
                            value="${getExpenseValue(step.title, section.title, account)}"
                            oninput="
                                setExpenseValue(
                                    '${step.title}',
                                    '${section.title}',
                                    '${account}',
                                    this.value
                                );
                                updateExpenseSummary();
                            ">

                    </div>

                `;
            });

            html += "</div>";
        });
    }

    document.getElementById("expenseSteps").innerHTML = html;

    // ========= Navigation =========

    document.getElementById("prevExpense").style.display =
        EXPENSE.current == 0 ? "none" : "inline-block";

    document.getElementById("nextExpense").style.display =
        EXPENSE.current == EXPENSE.steps.length - 1 ? "none" : "inline-block";

    document.getElementById("saveExpense").style.display =
        EXPENSE.current == EXPENSE.steps.length - 1 ? "inline-block" : "none";

    // ========= Progress =========

    document.getElementById("stepNumber").innerHTML =
        "Step " + (EXPENSE.current + 1);

    document.getElementById("stepTotal").innerHTML =
        "of " + EXPENSE.steps.length;

    const progress = ((EXPENSE.current + 1) / EXPENSE.steps.length) * 100;

    document.getElementById("wizardProgressBar").style.width = progress + "%";

    updateExpenseSummary();
}

function saveExpensesForm() {
    google.script.run

        .withSuccessHandler(function () {
            alert("Expenses saved successfully.");

            showTab("expenses");
        })

        .saveExpenses({
            period: APP.period,

            expenses: EXPENSE.values,
        });
}

function updateExpenseSummary() {
    const step = EXPENSE.steps[EXPENSE.current];

    let stepTotal = 0;

    let monthTotal = 0;

    EXPENSE.values.forEach((e) => {
        monthTotal += e.amount;

        if (e.category == step.title) stepTotal += e.amount;
    });

    document.getElementById("stepAmount").innerHTML = money(stepTotal);

    document.getElementById("monthAmount").innerHTML = money(monthTotal);
}

function getExpenseValue(category, subcategory, account) {
    const item = EXPENSE.values.find(
        (e) =>
            e.category == category &&
            e.subcategory == subcategory &&
            e.account == account,
    );

    return item ? item.amount : "";
}

function nextExpenseStep() {
    if (EXPENSE.current < EXPENSE.steps.length - 1) {
        EXPENSE.current++;
        renderExpenseStep();
    }
}

function previousExpenseStep() {
    if (EXPENSE.current > 0) {
        EXPENSE.current--;
        renderExpenseStep();
    }
}
