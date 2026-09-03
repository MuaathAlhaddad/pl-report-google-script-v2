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
        // The generic top-level "message" (e.g. "فشل في حفظ الفاتورة...")
        // is useless on its own -- Daftra puts the actual per-field reason
        // in "errors", which a short slice() of the raw body was cutting
        // off before anyone could see it (confirmed 2026-08-25: the
        // truncated message ended mid-sentence with no closing quote).
        let detail = body;
        try {
            const parsed = JSON.parse(body);
            // The real field is "validation_errors", not "errors" --
            // confirmed 2026-08-25 against a real rejected invoice (a
            // missing client_email). This originally guessed "errors"
            // and only "worked" because the fallback to the raw body
            // happened to be short enough to fit in the slice() below.
            if (parsed && parsed.validation_errors) {
                detail = JSON.stringify(parsed.validation_errors);
            }
        } catch (e) {
            // Not JSON -- fall back to the raw body below.
        }

        throw new Error(
            `Daftra API error ${code} creating invoice: ${detail.slice(0, 1000)}`,
        );
    }

    const result = JSON.parse(body);
    const invoice = daftraUnwrap_(result, "Invoice") || result;

    return {
        id: invoice.id,
        no: invoice.no || invoice.invoice_number || invoice.id,
    };
}

// Creates ONE client payment -- money credited straight to a client's
// account balance, NOT tied to a specific invoice (that's what
// client_payments.json is for; see getDaftraClientAccountPayments() above
// for the read-side distinction from invoice_payments.json). Daftra applies
// it against the client's outstanding balance itself.
//
// Payload shape confirmed working against this account via the sibling
// employee-debts-api project's addDaftraClientPayment() (same Daftra
// account, ported here for the same bulk-entry use case as
// createDaftraInvoice_ above). paymentMethod/treasuryId are optional but
// often effectively required in practice: Daftra's own UI always makes you
// pick both when recording a payment by hand, and a payment with no
// treasury to land in doesn't make accounting sense, so a real account may
// reject (or silently mishandle) a payment missing them even though the API
// docs list every ClientPayment/InvoicePayment field as "optional".
function createDaftraClientPayment_(clientId, amount, dateStr, notes, paymentMethod, treasuryId) {
    const { subdomain, apiKey } = getDaftraConfig_();

    const fields = {
        client_id: clientId,
        amount: amount,
        date: dateStr,
        notes: notes || "",
        // Confirmed 2026-08-28: without this, the API returns a 2xx success
        // and an id, but the payment never shows up in Daftra -- it silently
        // lands in a non-"Completed" status (docs list the enum as 0=Not
        // completed, 1=Completed, 2=Pending, 3=Failed, 4=Overpaid,
        // 5=Draft, without saying what a new payment defaults to). Since
        // this tool only ever records money that was actually received,
        // Completed is always the right value here, not something to make
        // configurable.
        status: 1,
    };

    if (paymentMethod) fields.payment_method = paymentMethod;
    if (treasuryId) fields.treasury_id = Number(treasuryId);

    const payload = { ClientPayment: fields };

    const url = `https://${subdomain}.daftra.com/api2/client_payments.json`;

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
        let detail = body;
        try {
            const parsed = JSON.parse(body);
            if (parsed && parsed.validation_errors) {
                detail = JSON.stringify(parsed.validation_errors);
            }
        } catch (e) {
            // Not JSON -- fall back to the raw body below.
        }

        throw new Error(
            `Daftra API error ${code} creating client payment: ${detail.slice(0, 1000)}`,
        );
    }

    const result = JSON.parse(body);
    const payment = daftraUnwrap_(result, "ClientPayment") || result;

    // A 2xx with no real id means something looked like success without
    // actually creating anything -- treat that as a failure instead of
    // reporting a false "success" back to the Bulk Payment page.
    if (!payment || !payment.id) {
        throw new Error(
            `Daftra returned ${code} but no payment id -- nothing was actually created. Response: ${body.slice(0, 500)}`,
        );
    }

    // Read it straight back rather than trusting the create response alone
    // -- confirmed 2026-08-28: a real-looking id (#16658) came back from
    // POST, but the payment never showed up in Daftra's UI. This tells us
    // whether the record is genuinely retrievable via the API afterward,
    // and if so, what its actual saved fields are (status/treasury/amount
    // can silently differ from what was sent). A failure here doesn't
    // un-create the payment -- it's diagnostic only.
    let verified = null;
    try {
        const checkPayload = daftraGet_(`client_payments/${payment.id}.json`);
        verified = daftraUnwrap_(checkPayload, "ClientPayment") || checkPayload;
    } catch (e) {
        verified = { readBackError: e.message };
    }

    return { id: payment.id, verified };
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
            "Treasury",
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

// Run manually from the editor if the Bulk Payment page's Treasury dropdown
// is empty -- "treasuries.json" (see searchDaftraTreasuries() in
// BulkPayment.gs) is a guessed endpoint name, not confirmed against this
// account. This logs the raw response so you can see whether the endpoint
// exists at all and, if so, what the real field names are.
function testDaftraTreasuries() {
    Logger.log("--- Raw treasuries response (page 1) ---");
    try {
        Logger.log(
            JSON.stringify(daftraGet_("treasuries.json", { page: 1, limit: 20 }), null, 2),
        );
    } catch (e) {
        Logger.log("Request failed: " + e.message);
    }

    Logger.log("--- Mapped treasuries (searchDaftraTreasuries) ---");
    Logger.log(JSON.stringify(searchDaftraTreasuries(), null, 2));
}
