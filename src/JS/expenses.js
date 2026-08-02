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
    google.script.run

        .withSuccessHandler(function (data) {
            if (data.exists) {
                alert("Expenses for this month already exist.");

                return;
            }

            EXPENSE.steps = data.setup;

            EXPENSE.values = data.values;

            EXPENSE.current = 0;

            renderExpenseStep();
        })

        .getExpenseWizard(APP.period);
}

function loadExpenseDashboard() {
    google.script.run

        .withSuccessHandler(renderExpenseDashboard)

        .getExpenseDashboard(APP.period);
}

function renderExpenseDashboard(data) {
    let html = `

        <div class="pageHeader">

            <h1>Expenses Dashboard</h1>

        </div>

        <div class="summaryGrid">

            <div class="summaryCard">

                <div class="title">
                    Total Expenses
                </div>

                <div class="value">
                    ${money(data.total)}
                </div>

            </div>

        </div>

    `;

    html += `<table class="salesTable">`;

    html += `
        <thead>
            <tr>
                <th>Main Category</th>
                <th>Total</th>
            </tr>
        </thead>
        <tbody>
    `;

    for (const category in data.categories) {
        html += `

            <tr>

                <td>${category}</td>

                <td>${money(data.categories[category])}</td>

            </tr>

        `;
    }

    html += `</tbody></table>`;

    if (!data.exists) {
        html += `

            <div style="margin-top:25px;text-align:right;">

                <button
                    class="primaryButton"
                    onclick="showExpenseWizard()">

                    ➕ Create Expenses

                </button>

            </div>

        `;
    } else {
        html += `

            <div
                style="
                    margin-top:25px;
                    color:#43A047;
                    font-weight:bold;
                ">

                ✓ Expenses already recorded.

            </div>

        `;
    }

    document.getElementById("expenseDashboard").innerHTML = html;
}

function renderExpenseStep() {
    const step = EXPENSE.steps[EXPENSE.current];

    document.getElementById("expenseTitle").innerHTML = step.title;

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

    document.getElementById("expenseWizard").innerHTML = html;

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
