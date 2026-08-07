let CHARTS = {
    yearSales: null,
    yearExpenses: null,
    month: null,
};

let chartJsPromise = null;

function ensureChartJs() {
    if (window.Chart) return Promise.resolve();
    if (chartJsPromise) return chartJsPromise;

    chartJsPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src =
            "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Chart.js failed to load"));
        document.head.appendChild(script);
    });

    return chartJsPromise;
}

function loadInsightsDashboard() {
    showLoading();

    const year = Number(APP.period.split("-")[0]);

    Promise.all([
        gsRun("getYearlyInsights", year),
        gsRun("getSupplierCalendar"),
        gsRun("getSales", APP.period),
    ])
        .then(([yearData, suppliers, monthSales]) => {
            renderInsightsDashboard(yearData, suppliers, monthSales);
            hideLoading();
        })
        .catch((err) => {
            hideLoading();
            showError(err);
        });
}

function renderInsightsDashboard(yearData, suppliers, monthSales) {
    let html = `
    <div class="pageHeader">
        <div>
            <div class="pageTitle">📊 Business Dashboard</div>
            <div class="pageSubtitle">Sales &amp; Expenses Insights</div>
        </div>
        <div class="pagePeriod">${formatPeriod(APP.period)}</div>
    </div>

    <div class="dashboardSection">
        <div class="sectionTitle">This Week's Supplier Payments</div>
        ${renderSupplierCalendar(suppliers)}
    </div>

    <div class="dashboardSection">
        <div class="sectionTitle">${formatPeriod(APP.period)} — Daily Sales vs Expenses</div>

        <div class="chartCard chartCardWide">
            ${
                monthSales.length
                    ? `<div class="chartCanvasWrap"><canvas id="monthChart"></canvas></div>`
                    : `<div class="chartEmpty">No sales recorded yet for ${formatPeriod(APP.period)}.</div>`
            }
        </div>
    </div>

    <div class="dashboardSection">
        <div class="sectionTitle">Yearly Overview — ${yearData.year} vs ${yearData.year - 1}</div>

        <div class="yearlyGrid">
            <div class="chartCard">
                <h2>Sales Comparison</h2>
                <div class="chartCanvasWrap"><canvas id="yearSalesChart"></canvas></div>
            </div>
            <div class="chartCard">
                <h2>Expenses Comparison</h2>
                <div class="chartCanvasWrap"><canvas id="yearExpensesChart"></canvas></div>
            </div>
            <div class="chartCard">
                <h2>${yearData.year} Totals</h2>
                ${renderYearTotalsTable(yearData.totals, yearData.year)}
            </div>
        </div>
    </div>
    `;

    document.getElementById("dashboardPage").innerHTML = html;

    ensureChartJs()
        .then(function () {
            renderYearSalesChart(yearData);
            renderYearExpensesChart(yearData);
            renderMonthChart(monthSales);
        })
        .catch(function (err) {
            document
                .getElementById("dashboardPage")
                .insertAdjacentHTML(
                    "beforeend",
                    `<p style="color:${COLORS.danger};text-align:center;">Charts failed to load: ${err.message}</p>`,
                );
        });
}

// ---------- Current month chart ----------

function renderMonthChart(monthSales) {
    const ctx = document.getElementById("monthChart");
    if (!ctx) return;
    if (CHARTS.month) CHARTS.month.destroy();

    CHARTS.month = new Chart(ctx, {
        type: "line",
        data: {
            labels: monthSales.map((r) => r.date.slice(0, 2)),
            datasets: [
                {
                    label: "Sales",
                    data: monthSales.map((r) => r.totalSales),
                    borderColor: COLORS.primary,
                    backgroundColor: COLORS.primary,
                    tension: 0.3,
                    pointRadius: 2,
                    fill: false,
                },
                {
                    label: "Expenses",
                    data: monthSales.map(
                        (r) => r.dailyExpense + r.otherExpenses,
                    ),
                    borderColor: COLORS.neutral,
                    backgroundColor: COLORS.neutral,
                    tension: 0.3,
                    pointRadius: 2,
                    fill: false,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "bottom" } },
            scales: { x: { title: { display: true, text: "Day" } } },
        },
    });
}

// ---------- Yearly charts + table ----------

function renderYearSalesChart(data) {
    const ctx = document.getElementById("yearSalesChart");
    if (!ctx) return;
    if (CHARTS.yearSales) CHARTS.yearSales.destroy();

    CHARTS.yearSales = new Chart(ctx, {
        type: "line",
        data: {
            labels: data.months.map(monthShortName),
            datasets: [
                {
                    label: String(data.year),
                    data: data.currentSales,
                    borderColor: COLORS.primary,
                    backgroundColor: COLORS.primary,
                    tension: 0.3,
                    pointRadius: 3,
                    fill: false,
                },
                {
                    label: String(data.year - 1),
                    data: data.previousSales,
                    borderColor: "#B0BEC5",
                    backgroundColor: "#B0BEC5",
                    tension: 0.3,
                    pointRadius: 3,
                    fill: false,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "bottom" } },
        },
    });
}

function renderYearExpensesChart(data) {
    const ctx = document.getElementById("yearExpensesChart");
    if (!ctx) return;
    if (CHARTS.yearExpenses) CHARTS.yearExpenses.destroy();

    CHARTS.yearExpenses = new Chart(ctx, {
        type: "line",
        data: {
            labels: data.months.map(monthShortName),
            datasets: [
                {
                    label: String(data.year),
                    data: data.currentExpenses,
                    borderColor: COLORS.neutral,
                    backgroundColor: COLORS.neutral,
                    tension: 0.3,
                    pointRadius: 3,
                    fill: false,
                },
                {
                    label: String(data.year - 1),
                    data: data.previousExpenses,
                    borderColor: "#CFD8DC",
                    backgroundColor: "#CFD8DC",
                    tension: 0.3,
                    pointRadius: 3,
                    fill: false,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "bottom" } },
        },
    });
}

function monthShortName(m) {
    const names = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
    ];
    return names[Number(m) - 1];
}

function renderYearTotalsTable(totals, year) {
    return `
        <table class="salesTable yearTotalsTable">
            <thead><tr><th>Metric</th><th>${year}</th></tr></thead>
            <tbody>
                <tr><td>Total Sales</td><td>${money(totals.sales)}</td></tr>
                <tr><td>Total Expenses</td><td>${money(totals.expenses)}</td></tr>
                <tr><td>Profit (5%)</td><td>${money(totals.profit)}</td></tr>
                <tr>
                    <td>Net Profit</td>
                    <td style="color:${totals.netProfit >= 0 ? COLORS.success : COLORS.danger};font-weight:bold;">
                        ${money(totals.netProfit)}
                    </td>
                </tr>
            </tbody>
        </table>
    `;
}

// ---------- Supplier calendar ----------

const DAY_NAMES = {
    Sun: "Sunday",
    Mon: "Monday",
    Tue: "Tuesday",
    Wed: "Wednesday",
    Thu: "Thursday",
    Fri: "Friday",
    Sat: "Saturday",
};

function renderSupplierCalendar(suppliers) {
    const todayKey = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
        new Date().getDay()
    ];

    return `
        <div class="supplierCalendar" id="supplierCalendar">
            ${suppliers
                .map(
                    (s) => `
                <div class="supplierCell ${s.day === todayKey ? "today" : ""}" data-day="${s.day}">
                    <div class="supplierDayLabel">${DAY_NAMES[s.day]}</div>

                    <div class="supplierItems">
                        ${
                            s.items.length
                                ? s.items
                                      .map(
                                          (item) => `
                            <div class="supplierItem ${item.done ? "done" : ""}">
                                <input
                                    type="checkbox"
                                    ${item.done ? "checked" : ""}
                                    onchange="toggleSupplierItem(this, ${item.row})"
                                />
                                <span class="supplierItemText">${escapeHtml(item.text)}</span>
                                <button
                                    class="supplierItemDelete"
                                    onclick="deleteSupplierItem(${item.row})"
                                    title="Remove"
                                >×</button>
                            </div>
                        `,
                                      )
                                      .join("")
                                : `<div class="supplierEmpty">Nothing yet</div>`
                        }
                    </div>

                    <input
                        type="text"
                        class="supplierAddInput"
                        placeholder="+ add note / todo"
                        onkeydown="if(event.key==='Enter') addSupplierItem(this, '${s.day}');"
                    />
                </div>
            `,
                )
                .join("")}
        </div>
    `;
}

function replaceSupplierCalendar(suppliers) {
    document.getElementById("supplierCalendar").outerHTML =
        renderSupplierCalendar(suppliers);
}

function toggleSupplierItem(checkbox, row) {
    checkbox.closest(".supplierItem").classList.toggle("done", checkbox.checked);

    gsRun("toggleSupplierItem", row, checkbox.checked).catch((err) => {
        checkbox.checked = !checkbox.checked;
        checkbox
            .closest(".supplierItem")
            .classList.toggle("done", checkbox.checked);
        showError(err);
    });
}

function addSupplierItem(input, day) {
    const text = input.value.trim();
    if (!text) return;

    input.disabled = true;

    gsRun("addSupplierItem", day, text)
        .then(replaceSupplierCalendar)
        .catch(showError);
}

function deleteSupplierItem(row) {
    gsRun("deleteSupplierItem", row)
        .then(replaceSupplierCalendar)
        .catch(showError);
}
