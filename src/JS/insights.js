let CHARTS = { trend: null, category: null };
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

    google.script.run
        .withSuccessHandler(function (data) {
            renderInsightsDashboard(data);
            hideLoading();
        })
        .withFailureHandler(function (err) {
            hideLoading();
            showError(err);
        })
        .getInsights(APP.period);
}

function renderInsightsDashboard(data) {
    const netProfit = data.summary.monthSales - data.expenses;

    let html = `
    <div class="pageHeader">
        <div>
            <div class="pageTitle">📊 Business Dashboard</div>
            <div class="pageSubtitle">Sales &amp; Expenses Insights</div>
        </div>
        <div class="pagePeriod">${formatPeriod(APP.period)}</div>
    </div>

    <div class="summaryGrid">
        <div class="summaryCard">
            <div class="title">Month Sales</div>
            <div class="value" style="color:#1976D2">${money(data.summary.monthSales)}</div>
        </div>
        <div class="summaryCard">
            <div class="title">Month Expenses</div>
            <div class="value" style="color:#EF6C00">${money(data.expenses)}</div>
        </div>
        <div class="summaryCard">
            <div class="title">Net Profit</div>
            <div class="value" style="color:${netProfit >= 0 ? "#2E7D32" : "#C62828"}">
                ${money(netProfit)}
            </div>
        </div>
    </div>

    <div class="chartsGrid">
        <div class="chartCard">
            <h2>Sales vs Expenses (Last 6 Months)</h2>
            <canvas id="trendChart"></canvas>
        </div>
        <div class="chartCard">
            <h2>Expenses by Category</h2>
            <canvas id="categoryChart"></canvas>
        </div>
    </div>
    `;

    document.getElementById("dashboardPage").innerHTML = html;

    ensureChartJs()
        .then(function () {
            renderTrendChart(data.salesTrend, data.expensesTrend);
            renderCategoryChart(data.expenseCategories);
        })
        .catch(function (err) {
            document
                .getElementById("dashboardPage")
                .insertAdjacentHTML(
                    "beforeend",
                    `<p style="color:#C62828;text-align:center;">Charts failed to load: ${err.message}</p>`,
                );
        });
}

function renderTrendChart(salesTrend, expensesTrend) {
    const ctx = document.getElementById("trendChart");
    if (!ctx) return;
    if (CHARTS.trend) CHARTS.trend.destroy();

    CHARTS.trend = new Chart(ctx, {
        type: "line",
        data: {
            labels: salesTrend.map((r) => formatPeriod(r.period)),
            datasets: [
                {
                    label: "Sales",
                    data: salesTrend.map((r) => r.total),
                    borderColor: "#1976D2",
                    backgroundColor: "rgba(25,118,210,0.1)",
                    tension: 0.3,
                    fill: true,
                },
                {
                    label: "Expenses",
                    data: expensesTrend.map((r) => r.total),
                    borderColor: "#EF6C00",
                    backgroundColor: "rgba(239,108,0,0.1)",
                    tension: 0.3,
                    fill: true,
                },
            ],
        },
        options: {
            responsive: true,
            plugins: { legend: { position: "bottom" } },
        },
    });
}

function renderCategoryChart(categories) {
    const ctx = document.getElementById("categoryChart");
    if (!ctx) return;
    if (CHARTS.category) CHARTS.category.destroy();

    const labels = Object.keys(categories);
    const values = Object.values(categories);
    const colors = [
        "#1976D2",
        "#43A047",
        "#F9A825",
        "#C62828",
        "#6A1B9A",
        "#00838F",
        "#EF6C00",
    ];

    if (!labels.length) {
        ctx.parentElement.innerHTML = `<p style="color:#888;text-align:center;padding:30px;">No expenses recorded for this month yet.</p>`;
        return;
    }

    CHARTS.category = new Chart(ctx, {
        type: "doughnut",
        data: { labels, datasets: [{ data: values, backgroundColor: colors }] },
        options: {
            responsive: true,
            plugins: { legend: { position: "bottom" } },
        },
    });
}
