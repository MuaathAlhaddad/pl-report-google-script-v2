let CHARTS = {
    yearSales: null,
    yearExpenses: null,
    hijriYearSales: null,
    hijriYearExpenses: null,
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
        gsRun("getHijriYearlyInsights", APP.period),
        gsRun("getSales", APP.period),
    ])
        .then(([yearData, hijriYearData, monthSales]) => {
            renderInsightsDashboard(yearData, hijriYearData, monthSales);
            hideLoading();
        })
        .catch((err) => {
            hideLoading();
            showError(err);
        });
}

function renderInsightsDashboard(yearData, hijriYearData, monthSales) {
    let html = `
    <div class="pageHeader">
        <div>
            <div class="pageTitle">📊 Business Dashboard</div>
            <div class="pageSubtitle">Sales &amp; Expenses Insights</div>
        </div>
        <div class="pagePeriod">${formatPeriod(APP.period)}</div>
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

    <div class="dashboardSection">
        <div class="sectionTitle">Yearly Overview (Hijri) — ${hijriYearData.year} AH vs ${hijriYearData.year - 1} AH</div>

        <div class="yearlyGrid">
            <div class="chartCard">
                <h2>Sales Comparison</h2>
                <div class="chartCanvasWrap"><canvas id="hijriYearSalesChart"></canvas></div>
            </div>
            <div class="chartCard">
                <h2>Expenses Comparison</h2>
                <div class="chartCanvasWrap"><canvas id="hijriYearExpensesChart"></canvas></div>
            </div>
            <div class="chartCard">
                <h2>${hijriYearData.year} AH Totals</h2>
                ${renderYearTotalsTable(hijriYearData.totals, hijriYearData.year + " AH")}
            </div>
        </div>
    </div>
    `;

    document.getElementById("dashboardPage").innerHTML = html;

    ensureChartJs()
        .then(function () {
            renderYearSalesChart(yearData);
            renderYearExpensesChart(yearData);
            renderHijriYearSalesChart(hijriYearData);
            renderHijriYearExpensesChart(hijriYearData);
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

function renderComparisonLineChart(
    chartKey,
    canvasId,
    labels,
    currentSeries,
    previousSeries,
    currentColor,
    previousColor,
) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (CHARTS[chartKey]) CHARTS[chartKey].destroy();

    CHARTS[chartKey] = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [
                {
                    label: currentSeries.label,
                    data: currentSeries.data,
                    borderColor: currentColor,
                    backgroundColor: currentColor,
                    tension: 0.3,
                    pointRadius: 3,
                    fill: false,
                },
                {
                    label: previousSeries.label,
                    data: previousSeries.data,
                    borderColor: previousColor,
                    backgroundColor: previousColor,
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

function renderYearSalesChart(data) {
    renderComparisonLineChart(
        "yearSales",
        "yearSalesChart",
        data.months.map(monthShortName),
        { label: String(data.year), data: data.currentSales },
        { label: String(data.year - 1), data: data.previousSales },
        COLORS.primary,
        "#B0BEC5",
    );
}

function renderYearExpensesChart(data) {
    renderComparisonLineChart(
        "yearExpenses",
        "yearExpensesChart",
        data.months.map(monthShortName),
        { label: String(data.year), data: data.currentExpenses },
        { label: String(data.year - 1), data: data.previousExpenses },
        COLORS.neutral,
        "#CFD8DC",
    );
}

function renderHijriYearSalesChart(data) {
    renderComparisonLineChart(
        "hijriYearSales",
        "hijriYearSalesChart",
        data.monthNames,
        { label: data.year + " AH", data: data.currentSales },
        { label: data.year - 1 + " AH", data: data.previousSales },
        COLORS.primary,
        "#B0BEC5",
    );
}

function renderHijriYearExpensesChart(data) {
    renderComparisonLineChart(
        "hijriYearExpenses",
        "hijriYearExpensesChart",
        data.monthNames,
        { label: data.year + " AH", data: data.currentExpenses },
        { label: data.year - 1 + " AH", data: data.previousExpenses },
        COLORS.neutral,
        "#CFD8DC",
    );
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

