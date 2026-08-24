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

// Creates ONE new sales invoice. invoiceFields is the raw Invoice object
// (client_id, date, and any other Invoice-level field Daftra accepts);
// items is an array of InvoiceItem objects (product_id, item, quantity,
// unit_price); payments is an optional array of Payment objects
// (payment_method, amount, date) to mark the invoice paid at creation time.
//
// The request shape (Invoice/InvoiceItem/Payment as SEPARATE top-level
// keys, not nested inside Invoice) comes from Daftra's own PHP API client
// source (github.com/mix-code/daftra-client/blob/master/src/DaftraClient.php),
// cross-checked against the "Edit Invoices" API docs page
// (docs.daftara.dev/15115239e0) for field names -- this has NOT been
// verified against this actual account yet, since doing that means
// actually creating a real invoice. Create one real invoice by hand first
// through the Bulk Invoice page and check it in Daftra before trusting
// bulk creation with real client data.
function createDaftraInvoice_(invoiceFields, items, payments) {
    const { subdomain, apiKey } = getDaftraConfig_();

    const payload = {
        Invoice: invoiceFields,
        InvoiceItem: items,
    };

    if (payments && payments.length) {
        payload.Payment = payments;
    }

    const url = `https://${subdomain}.daftra.com/api2/invoices.json`;

    const response = UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json",
        headers: {
            APIKEY: apiKey,
            Accept: "application/json",
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
    });

    const code = response.getResponseCode();
    const body = response.getContentText();

    if (code < 200 || code >= 300) {
        throw new Error(
            `Daftra API error ${code} creating invoice: ${body.slice(0, 300)}`,
        );
    }

    const result = JSON.parse(body);
    const invoice = daftraUnwrap_(result, "Invoice") || result;

    return {
        id: invoice.id,
        no: invoice.no || invoice.invoice_number || invoice.id,
    };
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
            "Income",
            "Product",
            "Client",
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

// Sum of "Incomes" recorded in Daftra on `dateStr` -- confirmed against
// your account's Incomes report (owner/incomes/report) that this is where
// "incoming Cash Receipt" money lives, i.e. cash added into the drawer
// that isn't a sale -- your "Cash Deposit" field.
function getDaftraCashDeposit(dateStr) {
    const payload = daftraGet_("incomes.json", {
        date_from: dateStr,
        date_to: dateStr,
        limit: 100,
    });

    return daftraExtractList_(payload)
        .map((item) => daftraUnwrap_(item, "Income"))
        .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
}

// Fetches all Daftra-backed figures for one date. A failure on any one of
// them (network hiccup, bad field name) doesn't block the others -- it
// falls back to 0 for that figure and reports what broke so the form
// still opens and you can fill that one in by hand.
function getDaftraDailyTotals(dateStr) {
    const result = {
        creditInvoices: 0,
        customerPayments: 0,
        otherExpenses: 0,
        cashDeposit: 0,
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

    try {
        result.cashDeposit = getDaftraCashDeposit(dateStr);
    } catch (e) {
        result.errors.push("Cash Deposit: " + e.message);
    }

    return result;
}

// Total amount currently owed by each client, across ALL their invoices --
// not just today's. This is the "who owes us money right now" list, i.e.
// your accounts receivable / debts.
//
// Uses Daftra's own `summary_unpaid` figure per invoice (confirmed via the
// API docs, Aug 2026), which is already netted against partial payments --
// so a half-paid invoice only counts its remaining balance, not the full
// total. That's more accurate than filtering by payment_status the way
// getDaftraCreditInvoices() does for "today only".
//
// Paginates through every invoice you have (up to a safety cap), so this
// can take a little while on an account with a lot of history -- that's
// expected, it's meant to be run occasionally for a full snapshot, not on
// every page load.
function getDaftraOutstandingDebts() {
    const balances = {}; // client_id -> { clientId, clientName, amount, phone }
    let page = 1;
    const limit = 100;
    const MAX_PAGES = 200; // safety valve, ~20,000 invoices

    while (page <= MAX_PAGES) {
        const payload = daftraGet_("invoices.json", { page, limit });

        const invoices = daftraExtractList_(payload).map((item) =>
            daftraUnwrap_(item, "Invoice"),
        );

        if (invoices.length === 0) break;

        invoices.forEach((inv) => {
            const unpaid = Number(inv.summary_unpaid) || 0;
            if (unpaid <= 0) return;

            const id = inv.client_id;
            const name =
                inv.client_business_name ||
                [inv.client_first_name, inv.client_last_name]
                    .filter(Boolean)
                    .join(" ") ||
                "Client #" + id;
            // Field name isn't confirmed against Daftra's docs -- worst case
            // this stays blank and the WhatsApp reminder button just doesn't
            // show for that client.
            const phone = inv.client_phone1 || inv.client_phone || inv.client_mobile || "";

            if (!balances[id]) {
                balances[id] = { clientId: id, clientName: name, amount: 0, phone };
            }
            balances[id].amount += unpaid;
            if (!balances[id].phone && phone) balances[id].phone = phone;
        });

        const pagination = payload && payload.pagination;
        const pageCount = pagination && Number(pagination.page_count);

        if (!pageCount || page >= pageCount) break;
        page++;
    }

    return Object.values(balances).sort((a, b) => b.amount - a.amount);
}

// Columns in the "Debts Snapshot" sheet. Two kinds of row share it:
//   Type "Long"  -- pulled from Daftra by this function. Phone/Amount Owed/
//                   Snapshot Time are overwritten from fresh Daftra data on
//                   every refresh; Status/Due Date/Date Given/Last Follow
//                   Up/Promise Count/Log are follow-up info an employee
//                   enters in the Debts page and must be preserved across
//                   refreshes. Amount Paid always stays 0 for Long debts --
//                   Daftra's summary_unpaid is already net of payments, so
//                   there's nothing for this app to track separately.
//   Type "Short" -- entered by hand (addShortDebt() in Debts.gs) for debts
//                   from the separate notebook that never becomes a
//                   Daftra invoice. This function never touches those
//                   rows -- they're carried forward as-is on every run.
//
// Log is a JSON array of {id, date, time, actor, note} follow-up entries,
// newest last -- kept as one JSON string per cell rather than extra sheet
// columns since its length varies per debt.
const DEBTS_HEADERS = [
    "Client",
    "Client ID",
    "Type",
    "Amount Owed",
    "Amount Paid",
    "Status",
    "Phone",
    "Due Date",
    "Date Given",
    "Last Follow Up",
    "Promise Count",
    "Log",
    "Snapshot Time",
];

// Pulls fresh balances from Daftra and writes them into the "Debts
// Snapshot" sheet -- run this from the editor (function dropdown ->
// refreshDebtsSnapshot -> Run) any time you want up-to-date numbers, or
// tap "Refresh from Daftra" in the Debts page (employees with edit access
// only). Only rewrites "Long" (Daftra) rows: Status/follow-up history an
// employee already entered is kept, only the amount/phone/snapshot time
// change, and a client who no longer owes anything (fully paid) drops off
// the list. "Short" rows (the manual notebook debts) are left completely
// untouched.
function refreshDebtsSnapshot() {
    const debts = getDaftraOutstandingDebts();

    const ss = SpreadsheetApp.getActive();
    let sheet = ss.getSheetByName(CONFIG.SHEETS.DEBTS);

    if (!sheet) {
        sheet = ss.insertSheet(CONFIG.SHEETS.DEBTS);
    }

    const lastRow = sheet.getLastRow();
    const existingLong = {}; // clientId -> preserved follow-up fields
    const shortRows = []; // carried forward untouched

    // Only trust what's already in the sheet if its header row matches the
    // current column layout -- e.g. right after changing the columns, an
    // older snapshot's cells would otherwise get misread into the wrong
    // fields. If it doesn't match, start clean for this one run.
    const currentHeaders =
        lastRow >= 1
            ? sheet.getRange(1, 1, 1, DEBTS_HEADERS.length).getValues()[0]
            : [];
    const headerMatches =
        JSON.stringify(currentHeaders) === JSON.stringify(DEBTS_HEADERS);

    if (headerMatches && lastRow > 1) {
        sheet
            .getRange(2, 1, lastRow - 1, DEBTS_HEADERS.length)
            .getValues()
            .forEach((row) => {
                const clientId = row[1];
                if (clientId === "" || clientId == null) return;

                if (row[2] === "Short") {
                    shortRows.push(row);
                    return;
                }

                existingLong[clientId] = {
                    status: row[5] || "",
                    dueDate: row[7] || "",
                    dateGiven: row[8] || "",
                    lastFollowUp: row[9] || "",
                    promiseCount: row[10] || 0,
                    log: row[11] || "",
                };
            });
    }

    sheet.clear();

    const now = new Date();

    sheet
        .getRange(1, 1, 1, DEBTS_HEADERS.length)
        .setValues([DEBTS_HEADERS])
        .setFontWeight("bold");

    const longRows = debts.map((d) => {
        const prev = existingLong[d.clientId] || {};

        // Daftra is the source of truth for whether a Long debt still
        // exists at all -- if it's showing up here, it's genuinely still
        // unpaid. A stale "paid"/"dead" tag from before (mismarked, or the
        // amount changed again after being paid down) would otherwise hide
        // a real debt from the list forever, which is exactly the "debts
        // getting lost" problem this page exists to prevent.
        const wasResolved = prev.status === "paid" || prev.status === "dead";
        const status = wasResolved ? CONFIG.DEBT_STATUS.ACTIVE : prev.status || CONFIG.DEBT_STATUS.ACTIVE;

        let log = prev.log || "[]";
        if (wasResolved) {
            const entries = parseDebtLog_(log);
            entries.push({
                id: Utilities.getUuid(),
                date: Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd"),
                time: now.toISOString(),
                actor: "System",
                note: `Daftra still shows this unpaid -- reopened from "${prev.status}".`,
            });
            log = JSON.stringify(entries);
        }

        return [
            d.clientName,
            d.clientId,
            "Long",
            d.amount,
            0,
            status,
            d.phone || "",
            prev.dueDate || "",
            prev.dateGiven || "",
            prev.lastFollowUp || "",
            prev.promiseCount || 0,
            log,
            now,
        ];
    });

    const allRows = longRows.concat(shortRows);

    if (allRows.length > 0) {
        sheet.getRange(2, 1, allRows.length, DEBTS_HEADERS.length).setValues(allRows);
    }

    sheet.autoResizeColumns(1, DEBTS_HEADERS.length);
    sheet.setFrozenRows(1);

    const total = debts.reduce((sum, d) => sum + d.amount, 0);

    Logger.log(
        `Debts snapshot done: ${debts.length} long debts totaling ${total} ` +
            `(plus ${shortRows.length} short debts carried forward unchanged).`,
    );

    return { longCount: debts.length, longTotal: total, shortCount: shortRows.length };
}

function parseDebtLog_(raw) {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

// Run manually from the editor to sanity-check credentials and see the raw
// Daftra responses before trusting the auto-filled form. Change TEST_DATE
// to a day you know has real invoices/payments/expenses in Daftra.
function testDaftraConnection() {
    // Edit this to any date you want to spot-check against Daftra's own
    // reports (e.g. "2026-08-20"). Defaults to today.
    const TEST_DATE = Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        "yyyy-MM-dd",
    );

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

    Logger.log("--- Raw incomes response ---");
    Logger.log(
        JSON.stringify( 
            daftraGet_("incomes.json", {
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

// Run manually from the editor BEFORE trusting the Bulk Invoice page --
// logs the raw products.json/clients.json responses so you can confirm the
// field names guessed in searchDaftraProducts()/searchDaftraClients()
// (BulkInvoice.gs) actually match what this account returns. If the mapped
// products/clients below show placeholder names like "Product #123" instead
// of real names, the guessed field names are wrong and need fixing before
// the picker in the UI will be usable.
function testDaftraProductsAndClients() {
    Logger.log("--- Raw products response (page 1) ---");
    Logger.log(
        JSON.stringify(daftraGet_("products.json", { page: 1, limit: 5 }), null, 2),
    );

    Logger.log("--- Raw clients response (page 1) ---");
    Logger.log(
        JSON.stringify(daftraGet_("clients.json", { page: 1, limit: 5 }), null, 2),
    );

    Logger.log("--- Mapped products (searchDaftraProducts) ---");
    Logger.log(JSON.stringify(searchDaftraProducts().slice(0, 5), null, 2));

    Logger.log("--- Mapped clients (searchDaftraClients) ---");
    Logger.log(JSON.stringify(searchDaftraClients().slice(0, 5), null, 2));
}
