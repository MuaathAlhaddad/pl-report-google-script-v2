function loadSalesDashboard() {
    const period = document.getElementById("periodSelector").value;

    showLoading();

    google.script.run
        .withSuccessHandler(function (data) {
            renderSalesDashboard(data);
            hideLoading();
        })
        .withFailureHandler(function (err) {
            hideLoading();
            showError(err);
        })
        .getDashboard(period);
}

function renderSalesDashboard(data) {
    let html = `

    <div class="pageHeader">

        <div>

            <div class="pageTitle">

                💰 Sales Dashboard

            </div>

            <div class="pageSubtitle">

                Monthly Performance Overview

            </div>

        </div>

        <div class="pagePeriod">

            ${formatPeriod(APP.period)}

        </div>

    </div>

    `;

    renderSummaryCards(data);

    renderSalesTable(data.sales);
}

function renderSummaryCards(data) {
    const progress =
        data.goal > 0 ? (data.summary.monthSales / data.goal) * 100 : 0;

    const cards = [
        {
            title: "Month Sales",
            value: money(data.summary.monthSales),
            color: COLORS.primary,
        },
        {
            title: "Goal",
            value: money(data.goal),
            color: COLORS.neutral,
            progress: Math.min(progress, 100),
        },
        {
            title: "Avg / Day",
            value: money(data.summary.average),
            color: COLORS.neutral,
        },
        {
            title: "Profit (5%)",
            value: money(data.profit),
            color: COLORS.success,
        },
        {
            title: "Expenses",
            value: money(data.expenses),
            color: COLORS.neutral,
        },
        {
            title: "Net Profit",
            value: money(data.netProfit),
            color: data.netProfit >= 0 ? COLORS.success : COLORS.danger,
        },
    ];

    let html = '<div class="summaryGrid">';

    cards.forEach((card) => {
        html += `

        <div class="summaryCard">

            <div class="title">${card.title}</div>

            <div class="value"
                 style="color:${card.color}">

                 ${card.value}

            </div>

            ${
                card.progress !== undefined
                    ? `
                <div class="progressContainer">

                    <div
                        class="progressLabel"
                        style="left:calc(${card.progress}% - 18px);">

                        ${Number(card.progress.toFixed(1))}%

                    </div>

                    <div class="progress">

                        <div
                            class="progressFill"
                            style="width:${card.progress}%">

                        </div>

                    </div>

                </div>
              `
                    : ""
            }

        </div>

        `;
    });

    html += "</div>";

    document.getElementById("summaryCards").innerHTML = html;
}

function renderSalesTable(rows) {
    let html = `

<table class="salesTable">

<thead>

<tr>

<th>Date</th>
<th>Closing Cash</th>
<th>Credit</th>
<th>Payments</th>
<th>Daily Exp.</th>
<th>Other Exp.</th>
<th>Client Pay</th>
<th>Withdrawal</th>
<th>Deposit</th>
<th>Total</th>

</tr>

</thead>

<tbody>

`;

    rows.forEach((r) => {
        html += `

<tr class="salesRow" >

<td>${r.date}</td>

<td>${money(r.cash)}</td>

<td>${money(r.creditInvoices)}</td>

<td>${money(r.payments)}</td>

<td>${money(r.dailyExpense)}</td>

<td>${money(r.otherExpenses)}</td>

<td>${money(r.customerPayments)}</td>

<td>${money(r.cashWithdrawal)}</td>

<td>${money(r.cashDeposit)}</td>

<td>${money(r.totalSales)}</td>

</tr>

`;
    });

    const period = document.getElementById("periodSelector").value;

    if (isCurrentPeriod(period)) {
        html += `
   <button class="fab" onclick="showSalesForm()">+</button>
    `;
    }

    html += `
</tbody>
</table>
`;

    document.getElementById("salesTable").innerHTML = html;

    const newRow = document.querySelector(".newReportRow");

    if (newRow) {
        newRow.onclick = showSalesForm;
    }
}

function calculateTotalSalesClient(r) {
    return (
        Number(r.cash) +
        Number(r.creditInvoices) +
        Number(r.payments) +
        Number(r.dailyExpense) +
        Number(r.otherExpenses) -
        Number(r.customerPayments) -
        Number(r.cashDeposit)
    );
}
