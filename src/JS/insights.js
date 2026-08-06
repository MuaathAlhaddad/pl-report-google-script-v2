let CHARTS = {
    yearSales: null,
    yearExpenses: null,
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
    ])
        .then(([yearData, suppliers]) => {
            renderInsightsDashboard(yearData, suppliers);
            hideLoading();
        })
        .catch((err) => {
            hideLoading();
            showError(err);
        });
}

function renderInsightsDashboard(yearData, suppliers) {
    let html = `
    <div class="pageHeader">
        <div>
            <div class="pageTitle">📊 Business Dashboard</div>
            <div class="pageSubtitle">Sales &amp; Expenses Insights</div>
        </div>
        <div class="pagePeriod">${formatPeriod(APP.period)}</div>
    </div>

    <div class="dashboardSection">
        <div class="sectionTitle">Yearly Overview — ${yearData.year} vs ${yearData.year - 1}</div>

        <div class="yearlyGrid">
            <div class="chartCard">
                <h2>Sales Comparison</h2>
                <canvas id="yearSalesChart"></canvas>
            </div>
            <div class="chartCard">
                <h2>Expenses Comparison</h2>
                <canvas id="yearExpensesChart"></canvas>
            </div>
            <div class="chartCard">
                <h2>${yearData.year} Totals</h2>
                ${renderYearTotalsTable(yearData.totals, yearData.year)}
            </div>
        </div>
    </div>

    <div class="dashboardSection">
        <div class="sectionTitle">This Week's Supplier Payments</div>
        ${renderSupplierCalendar(suppliers)}
    </div>
    `;

    document.getElementById("dashboardPage").innerHTML = html;

    ensureChartJs()
        .then(function () {
            renderYearSalesChart(yearData);
            renderYearExpensesChart(yearData);
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

// ---------- Yearly charts + table ----------

function renderYearSalesChart(data) {
    const ctx = document.getElementById("yearSalesChart");
    if (!ctx) return;
    if (CHARTS.yearSales) CHARTS.yearSales.destroy();

    CHARTS.yearSales = new Chart(ctx, {
        type: "bar",
        data: {
            labels: data.months.map(monthShortName),
            datasets: [
                {
                    label: String(data.year),
                    data: data.currentSales,
                    backgroundColor: COLORS.primary,
                },
                {
                    label: String(data.year - 1),
                    data: data.previousSales,
                    backgroundColor: "#B0BEC5",
                },
            ],
        },
        options: {
            responsive: true,
            plugins: { legend: { position: "bottom" } },
        },
    });
}

function renderYearExpensesChart(data) {
    const ctx = document.getElementById("yearExpensesChart");
    if (!ctx) return;
    if (CHARTS.yearExpenses) CHARTS.yearExpenses.destroy();

    CHARTS.yearExpenses = new Chart(ctx, {
        type: "bar",
        data: {
            labels: data.months.map(monthShortName),
            datasets: [
                {
                    label: String(data.year),
                    data: data.currentExpenses,
                    backgroundColor: COLORS.neutral,
                },
                {
                    label: String(data.year - 1),
                    data: data.previousExpenses,
                    backgroundColor: "#CFD8DC",
                },
            ],
        },
        options: {
            responsive: true,
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
        <div class="supplierCalendar">
            ${suppliers
                .map(
                    (s) => `
                <div class="supplierCell ${s.day === todayKey ? "today" : ""}" data-day="${s.day}">
                    <div class="supplierDayLabel">${DAY_NAMES[s.day]}</div>
                    <div class="supplierNoteDisplay" ondblclick="editSupplierNote(this)">
                        ${s.notes ? s.notes : '<span class="supplierEmpty">— double-click to add —</span>'}
                    </div>
                    <input
                        class="supplierNoteInput"
                        style="display:none"
                        value="${s.notes.replace(/"/g, "&quot;")}"
                        onblur="saveSupplierNoteFromInput(this)"
                        onkeydown="if(event.key==='Enter') this.blur();"
                    />
                </div>
            `,
                )
                .join("")}
        </div>
    `;
}

function editSupplierNote(displayEl) {
    const cell = displayEl.closest(".supplierCell");
    const input = cell.querySelector(".supplierNoteInput");

    displayEl.style.display = "none";
    input.style.display = "block";
    input.focus();
    input.select();
}

function saveSupplierNoteFromInput(inputEl) {
    const cell = inputEl.closest(".supplierCell");
    const display = cell.querySelector(".supplierNoteDisplay");
    const day = cell.dataset.day;
    const value = inputEl.value.trim();

    display.innerHTML = value
        ? value
        : '<span class="supplierEmpty">— double-click to add —</span>';
    display.style.display = "block";
    inputEl.style.display = "none";

    gsRun("saveSupplierNote", day, value).catch(showError);
}
