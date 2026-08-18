// Pulls today's report totals from Daftra so the sales form doesn't need
// them typed in by hand every night.
//
// ONE-TIME SETUP:
//   Apps Script editor -> Project Settings (gear icon, left sidebar)
//   -> Script Properties -> Add script property
//     DAFTRA_SUBDOMAIN = muaath20002024   (from https://muaath20002024.daftra.com)
//     DAFTRA_API_KEY   = <your Daftra API key>
//
// Credentials never live in this file or in git -- Script Properties are
// stored per-deployment on Google's side, not pushed/pulled by clasp.
//
// BEFORE TRUSTING THE NUMBERS: run testDaftraConnection() once from this
// editor (function dropdown at the top -> testDaftraConnection -> Run,
// then View > Logs) and compare the totals against your Daftra reports in
// the browser. Daftra's API docs are a little inconsistent about response
// shapes, so this is worth a real check before it's making the numbers
// that land in your sheet unattended.

function getDaftraConfig_() {
    const props = PropertiesService.getScriptProperties();
    const subdomain = props.getProperty("DAFTRA_SUBDOMAIN");
    const apiKey = props.getProperty("DAFTRA_API_KEY");

    if (!subdomain || !apiKey) {
        throw new Error(
            "Daftra not configured. Set DAFTRA_SUBDOMAIN and DAFTRA_API_KEY " +
                "in Project Settings > Script Properties.",
        );
    }

    return { subdomain, apiKey };
}

function daftraGet_(path, params) {
    const { subdomain, apiKey } = getDaftraConfig_();

    const query = Object.keys(params || {})
        .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(params[k]))
        .join("&");

    const url =
        `https://${subdomain}.daftra.com/api2/${path}` +
        (query ? "?" + query : "");

    const response = UrlFetchApp.fetch(url, {
        method: "get",
        headers: {
            APIKEY: apiKey,
            Accept: "application/json",
        },
        muteHttpExceptions: true,
    });

    const code = response.getResponseCode();
    const body = response.getContentText();

    if (code < 200 || code >= 300) {
        throw new Error(
            `Daftra API error ${code} on ${path}: ${body.slice(0, 300)}`,
        );
    }

    return JSON.parse(body);
}

// Daftra's list endpoints aren't 100% consistent about the wrapper key
// across API versions/endpoints. Try the common shapes rather than
// assuming one, so a quirky response returns an empty list instead of
// throwing.
function daftraExtractList_(payload) {
    if (Array.isArray(payload)) return payload;

    if (payload && typeof payload === "object") {
        const candidates = [
            "data",
            "result",
            "Invoice",
            "Expense",
            "ClientPayment",
            "InvoicePayment",
            "items",
        ];

        for (const key of candidates) {
            if (Array.isArray(payload[key])) return payload[key];
        }
    }

    return [];
}

// Confirmed against a real account (Aug 2026): each item in the "data"
// array comes back wrapped one level deeper, e.g.
// { "Invoice": { payment_status: "0", summary_total: "10", ... } } rather
// than the fields directly on the item. Unwrap defensively -- if a future
// response isn't wrapped, `item[key]` is just undefined and we fall back
// to the item itself.
function daftraUnwrap_(item, key) {
    return item && item[key] ? item[key] : item;
}

// Sum of unpaid invoices dated `dateStr` -- since every customer-debt
// invoice you create uses the "due invoice" service and nothing else goes
// out unpaid, "unpaid invoices today" IS the Credit Invoices total.
function getDaftraCreditInvoices(dateStr) {
    const payload = daftraGet_("invoices.json", {
        date_from: dateStr,
        date_to: dateStr,
        limit: 100,
    });

    const invoices = daftraExtractList_(payload).map((item) =>
        daftraUnwrap_(item, "Invoice"),
    );

    return invoices
        .filter((inv) => {
            const status = String(inv.payment_status || "").toLowerCase();
            return (
                status === "unpaid" ||
                status === "credit" ||
                status === "due" ||
                status === "0" ||
                status === "2"
            );
        })
        .reduce((sum, inv) => sum + (Number(inv.summary_total) || 0), 0);
}

// Daftra stores payments in TWO separate resources depending on how they
// were entered -- confirmed against a real account (15/08/2026: client_payments
// alone gave 493 vs the real Payments Report total of 661):
//   - invoice_payments.json ("InvoicePayment") -- a payment applied to a
//     specific invoice.
//   - client_payments.json ("ClientPayment") -- a payment credited straight
//     to a client's account balance, not tied to any invoice.
// The Daftra "Payments Report" you check by hand adds both together, so we
// do too.

// Sum of payments applied to a specific invoice on `dateStr`.
function getDaftraInvoicePayments(dateStr) {
    const payload = daftraGet_("invoice_payments.json", {
        date_from: dateStr,
        date_to: dateStr,
        limit: 100,
    });

    return daftraExtractList_(payload)
        .map((item) => daftraUnwrap_(item, "InvoicePayment"))
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
}

// Sum of payments credited straight to a client's account balance (not
// tied to any invoice) on `dateStr`.
function getDaftraClientAccountPayments(dateStr) {
    const payload = daftraGet_("client_payments.json", {
        date_from: dateStr,
        date_to: dateStr,
        limit: 100,
    });

    return daftraExtractList_(payload)
        .map((item) => daftraUnwrap_(item, "ClientPayment"))
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
}

// Total customer payments received on `dateStr` -- invoice-tied plus
// direct-to-account, matching what the Daftra Payments Report shows.
function getDaftraCustomerPayments(dateStr) {
    return (
        getDaftraInvoicePayments(dateStr) +
        getDaftraClientAccountPayments(dateStr)
    );
}

// Sum of expenses recorded in Daftra on `dateStr` -- your "Other Expenses".
// The heavy/normal "Daily Expense" estimate stays a manual pick, since
// that's a judgment call, not something Daftra tracks.
function getDaftraOtherExpenses(dateStr) {
    const payload = daftraGet_("expenses.json", {
        date_from: dateStr,
        date_to: dateStr,
        limit: 100,
    });

    return daftraExtractList_(payload)
        .map((item) => daftraUnwrap_(item, "Expense"))
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
}

// Fetches all three Daftra-backed figures for one date. A failure on any
// one of them (network hiccup, bad field name) doesn't block the others --
// it falls back to 0 for that figure and reports what broke so the form
// still opens and you can fill that one in by hand.
function getDaftraDailyTotals(dateStr) {
    const result = {
        creditInvoices: 0,
        customerPayments: 0,
        otherExpenses: 0,
        errors: [],
    };

    try {
        result.creditInvoices = getDaftraCreditInvoices(dateStr);
    } catch (e) {
        result.errors.push("Credit Invoices: " + e.message);
    }

    try {
        result.customerPayments = getDaftraCustomerPayments(dateStr);
    } catch (e) {
        result.errors.push("Customer Payments: " + e.message);
    }

    try {
        result.otherExpenses = getDaftraOtherExpenses(dateStr);
    } catch (e) {
        result.errors.push("Other Expenses: " + e.message);
    }

    return result;
}

// Run manually from the editor to sanity-check credentials and see the raw
// Daftra responses before trusting the auto-filled form. Change TEST_DATE
// to a day you know has real invoices/payments/expenses in Daftra.
function testDaftraConnection() {
    // Pinned to the date you already checked by hand (Payments Report
    // total: 661.00) so this run is a direct comparison. Change back to
    // today's date, or any other date, once you've confirmed it matches.
    const TEST_DATE = "2026-08-15";

    Logger.log("Testing Daftra connection for " + TEST_DATE);

    Logger.log("--- Raw invoices response ---");
    Logger.log(
        JSON.stringify(
            daftraGet_("invoices.json", {
                date_from: TEST_DATE,
                date_to: TEST_DATE,
                limit: 5,
            }),
            null,
            2,
        ),
    );

    Logger.log("--- Raw invoice_payments response ---");
    Logger.log(
        JSON.stringify(
            daftraGet_("invoice_payments.json", {
                date_from: TEST_DATE,
                date_to: TEST_DATE,
                limit: 5,
            }),
            null,
            2,
        ),
    );

    Logger.log("--- Raw client_payments response ---");
    Logger.log(
        JSON.stringify(
            daftraGet_("client_payments.json", {
                date_from: TEST_DATE,
                date_to: TEST_DATE,
                limit: 5,
            }),
            null,
            2,
        ),
    );

    Logger.log("--- Raw expenses response ---");
    Logger.log(
        JSON.stringify(
            daftraGet_("expenses.json", {
                date_from: TEST_DATE,
                date_to: TEST_DATE,
                limit: 5,
            }),
            null,
            2,
        ),
    );

    Logger.log("--- Computed totals ---");
    Logger.log(JSON.stringify(getDaftraDailyTotals(TEST_DATE), null, 2));
}
