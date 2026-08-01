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

      function getValue(id) {
        const el = document.getElementById(id);

        return el ? Number(el.value) || 0 : 0;
      }

      function loadSalesDashboard() {
        const period = document.getElementById("periodSelector").value;

        google.script.run
          .withSuccessHandler(renderSalesDashboard)
          .getDashboard(period);
      }

      function renderSalesDashboard(data) {
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
            color: "#1976D2",
          },

          {
            title: "Goal",
            value: money(data.goal),
            color: "#6A1B9A",
            progress: Math.min(progress, 100),
          },

          {
            title: "Avg / Day",
            value: money(data.summary.average),
            color: "#00838F",
          },

          {
            title: "Profit (5%)",
            value: money(data.profit),
            color: "#2E7D32",
          },

          {
            title: "Expenses",
            value: money(data.expenses),
            color: "#EF6C00",
          },

          {
            title: "Net Profit",
            value: money(data.netProfit),
            color: data.netProfit >= 0 ? "#2E7D32" : "#C62828",
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

    <tr class="newReportRow">

        <td colspan="10">

            ➕ Create New Report

        </td>

    </tr>

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

      function showDashboard() {
        showTab(APP.currentTab);
      }

      function showTab(tab) {
        APP.currentTab = tab;

        document.getElementById("salesPage").style.display =
          tab == "sales" ? "block" : "none";

        document.getElementById("expensesPage").style.display =
          tab == "expenses" ? "block" : "none";

        document
          .querySelectorAll(".tab")
          .forEach((t) => t.classList.remove("active"));

        document.getElementById(tab + "Tab").classList.add("active");

        if (tab == "sales") loadSalesDashboard();
        else loadExpenseDashboard();
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

        document.getElementById("creditInvoices").value =
          data.creditInvoices ?? 0;

        document.getElementById("payments").value = data.payments ?? "";

        document.getElementById("otherExpenses").value =
          data.otherExpenses ?? 0;

        document.getElementById("customerPayments").value =
          data.customerPayments ?? 0;

        document.getElementById("cashWithdrawal").value =
          data.cashWithdrawal ?? 0;

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

      function money(value) {
        return Number(value || 0).toLocaleString();
      }

      function selectExpense(card, value) {
        document
          .querySelectorAll(".expense-card")
          .forEach((c) => c.classList.remove("selected"));

        card.classList.add("selected");

        document.getElementById("dailyExpense").value = value;
      }

      function copyDateText(button) {
        const dateInput = document.getElementById("date").value;

        if (!dateInput) {
          alert("Please select a date first.");
          return;
        }

        const [year, month, day] = dateInput.split("-");

        const formatted = `${day}/${month}/${year}`;

        navigator.clipboard.writeText(formatted);

        const original = button.innerHTML;

        button.innerHTML = "✅";

        setTimeout(function () {
          button.innerHTML = original;
        }, 1000);
      }

      function copyPaymentsScript(button) {
        const script = `const result = [...document.querySelectorAll(".entry-time")]
.map(e => parseFloat(e.innerText.replace(/,/g,"")))
.join("+");

console.log(result);`;

        navigator.clipboard.writeText(script);

        const original = button.innerHTML;

        button.innerHTML = "✅";

        setTimeout(function () {
          button.innerHTML = original;
        }, 1000);
      }

      function showSalesForm() {
        document.getElementById("salesFormPage").style.display = "block";

        document.getElementById("dashboardPage").style.display = "none";

        initializeSalesForm();
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

          cashDeposit:
            Number(document.getElementById("cashDeposit").value) || 0,

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

      function showError(err) {
        alert(err.message || err);
      }

      function isCurrentPeriod(period) {
        const today = new Date();

        const current =
          today.getFullYear() +
          "-" +
          String(today.getMonth() + 1).padStart(2, "0");

        return period === current;
      }