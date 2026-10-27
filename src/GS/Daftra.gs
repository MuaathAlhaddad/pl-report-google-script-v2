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
// client_payments.json is for; a payment applied to a specific invoice
// lives in invoice_payments.json instead). Daftra applies
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

// Sum of expenses recorded in Daftra on `dateStr` -- your "Other Expenses".
// The heavy/normal "Daily Expense" estimate stays a manual pick, since
// that's a judgment call, not something Daftra tracks.
function getDaftraOtherExpenses(dateStr) {
    requireAuthorizedUser_();
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
    requireAuthorizedUser_();
    const payload = daftraGet_("incomes.json", {
        date_from: dateStr,
        date_to: dateStr,
        limit: 100,
    });

    return daftraExtractList_(payload)
        .map((item) => daftraUnwrap_(item, "Income"))
        .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
}

// Supplier payments recorded in Daftra on `dateStr` -- the "Payments" field
// of the sales form (column E, "=a+b+c").
//
// Source: journals.json?entity_type=purchase_order_payment. Every payment
// entered through Daftra's "Supplier Payments" screen creates one journal
// whose entity_id is the payment id and whose JournalTransaction[] carries
// a "treasury" leg (with the treasury's JournalAccount embedded, so no
// extra lookup per payment) and a "supplier" leg. Confirmed against the
// real account 2026-10-26: Sept 2026 P&L payments match this exactly on
// the days nothing was edited after closing.
//
// Owner's rules (2026-10-26, see DECISIONS.md):
// - Every payment counts, whatever treasury it came out of. A payment that
//   isn't from the primary cash box gets a note instead of being dropped --
//   payments are always expected to be cash, so a bank-treasury payment
//   is most likely a data-entry mistake in Daftra worth checking.
// - Payments Daftra creates itself (payment_method "supplier_credit",
//   settling an invoice from the supplier's balance) have no journal, so
//   they never appear here -- correct, since no cash leaves the drawer.
//
// Throws on any incomplete fetch: a partial list would silently understate
// the day's sales, so better no auto-fill than a wrong one.
function getDaftraSupplierPayments(dateStr) {
    requireAuthorizedUser_();

    const treasuries = {};
    let primaryTreasuryId = null;
    daftraFetchAllPages_("treasuries.json", {}).forEach((item) => {
        const t = daftraUnwrap_(item, "Treasury");
        treasuries[String(t.id)] = t;
        if (String(t.is_primary) === "1") primaryTreasuryId = String(t.id);
    });

    const journals = daftraFetchAllPages_("journals.json", {
        entity_type: "purchase_order_payment",
        date_from: dateStr,
        date_to: dateStr,
    }).map((item) => daftraUnwrap_(item, "Journal"));

    const dayJournals = journals
        // date_from/date_to is trusted, but a stray other-day row would
        // land in the wrong report, so double-check.
        .filter((j) => String(j.date) === dateStr)
        // Newest first (owner's choice, 2026-10-27), so the most recent
        // payments lead the Payments field and the snapshot rows.
        .sort((a, b) => Number(b.id) - Number(a.id));

    // Called with the API key (as Apps Script does), journals.json does NOT
    // embed each leg's JournalAccount -- only journal_account_id. (A
    // logged-in browser session does embed it, which is why a browser check
    // looked fine; confirmed 2026-10-27 from testDaftraSupplierPayments in
    // the editor.) So resolve the account ids (treasury + supplier) here.
    const accountIds = [];
    dayJournals.forEach((j) =>
        (j.JournalTransaction || []).forEach((t) => {
            if (!t.JournalAccount && t.journal_account_id) {
                accountIds.push(String(t.journal_account_id));
            }
        }),
    );
    const accounts = daftraJournalAccounts_(accountIds);

    const payments = dayJournals.map((j) =>
        supplierPaymentFromJournal_(j, treasuries, primaryTreasuryId, accounts),
    );

    const total = round2_(payments.reduce((sum, p) => sum + p.amount, 0));

    return {
        date: dateStr,
        payments,
        expression: payments.map((p) => formatAmount_(p.amount)).join("+"),
        total,
        count: payments.length,
        flaggedCount: payments.filter((p) => p.note).length,
    };
}

function supplierPaymentFromJournal_(j, treasuries, primaryTreasuryId, accounts) {
    const legs = j.JournalTransaction || [];
    const treasuryLeg = legs.find((t) => t.subkey === "treasury");
    const supplierLeg = legs.find((t) => t.subkey === "supplier");
    const accountOf = (leg) =>
        leg &&
        (leg.JournalAccount ||
            (accounts || {})[String(leg.journal_account_id)] ||
            null);

    const description = String(j.description || "");
    const codeMatch = description.match(/#(\d+)/);

    let treasuryId = "";
    let treasuryName = "";
    let note = "";

    const account = accountOf(treasuryLeg);
    if (treasuryLeg && !account) {
        note =
            "Couldn't look up this payment's treasury in Daftra (account " +
            treasuryLeg.journal_account_id +
            ") -- amount is still counted";
    } else if (account && account.entity_type === "treasury") {
        treasuryId = String(account.entity_id);
        const treasury = treasuries[treasuryId];
        treasuryName = (treasury && treasury.name) || account.name || "";

        if (treasury && String(treasury.type) === "1") {
            note =
                "Bank transfer (" +
                treasuryName.trim() +
                ") -- expected cash, check in Daftra";
        } else if (primaryTreasuryId && treasuryId !== primaryTreasuryId) {
            note =
                "Paid from " + treasuryName.trim() + ", not the main cash box";
        }
    } else {
        note = "No treasury on this payment's journal -- check in Daftra";
    }

    return {
        paymentId: String(j.entity_id),
        journalId: String(j.id),
        code: codeMatch ? codeMatch[1] : "",
        supplier: (accountOf(supplierLeg) || {}).name || "",
        amount: round2_(Number(j.total_debit) || 0),
        treasuryId,
        treasuryName: treasuryName.trim(),
        note,
        created: String(j.created || ""),
        modified: String(j.modified || ""),
    };
}

// Looks up Daftra journal accounts by id (journal_accounts/{id}.json),
// returning { id: JournalAccount }. Accounts (a treasury's or a supplier's)
// essentially never change, so each one is cached for 6 hours and the
// rest are fetched in parallel. An id that fails to load is simply missing
// from the result -- callers note it rather than fail the whole day.
function daftraJournalAccounts_(ids) {
    const unique = [...new Set(ids.map(String))];
    const result = {};
    if (!unique.length) return result;

    const cache = CacheService.getScriptCache();
    const cacheKey = (id) => "daftra_journal_account_" + id;
    const cached = cache.getAll(unique.map(cacheKey));

    const missing = [];
    unique.forEach((id) => {
        const hit = cached[cacheKey(id)];
        if (hit) result[id] = JSON.parse(hit);
        else missing.push(id);
    });
    if (!missing.length) return result;

    const { subdomain, apiKey } = getDaftraConfig_();
    const responses = UrlFetchApp.fetchAll(
        missing.map((id) => ({
            url: `https://${subdomain}.daftra.com/api2/journal_accounts/${encodeURIComponent(id)}.json`,
            method: "get",
            headers: { APIKEY: apiKey, Accept: "application/json" },
            muteHttpExceptions: true,
        })),
    );

    const toCache = {};
    responses.forEach((response, i) => {
        if (response.getResponseCode() !== 200) return;
        try {
            const payload = JSON.parse(response.getContentText());
            const account = daftraUnwrap_(
                (payload && payload.data) || payload,
                "JournalAccount",
            );
            if (!account || !account.id) return;
            // Only the fields used here, to stay well under cache limits.
            const slim = {
                id: String(account.id),
                name: account.name || "",
                entity_type: account.entity_type || "",
                entity_id: String(account.entity_id || ""),
            };
            result[missing[i]] = slim;
            toCache[cacheKey(missing[i])] = JSON.stringify(slim);
        } catch (e) {
            // Unparseable -- treated as not found.
        }
    });
    if (Object.keys(toCache).length) cache.putAll(toCache, 21600);

    return result;
}

// Fetches every page of a Daftra list endpoint. No page cap (a fixed cap
// once hid real records -- see CLAUDE.md), and throws if Daftra's own
// total_results disagrees with what came back, so a short read can't pass
// silently.
function daftraFetchAllPages_(path, params) {
    const all = [];
    let page = 1;
    let pageCount = 1;
    let expected = null;

    do {
        const payload = daftraGet_(
            path,
            Object.assign({}, params, { limit: 100, page }),
        );
        all.push(...daftraExtractList_(payload));

        const pagination = payload && payload.pagination;
        pageCount = pagination ? Number(pagination.page_count) || 1 : 1;
        if (pagination && pagination.total_results != null) {
            expected = Number(pagination.total_results);
        }
        page++;
    } while (page <= pageCount);

    if (expected !== null && all.length !== expected) {
        throw new Error(
            `Incomplete read from ${path}: got ${all.length} of ${expected} records`,
        );
    }

    return all;
}

// Daftra amounts carry float noise (e.g. "760.00008").
function round2_(n) {
    return Math.round(n * 100) / 100;
}

function formatAmount_(n) {
    return String(round2_(n));
}

// Fetches all Daftra-backed figures for one date. A failure on any one of
// them (network hiccup, bad field name) doesn't block the others -- it
// falls back to 0 for that figure and reports what broke so the form
// still opens and you can fill that one in by hand.
function getDaftraDailyTotals(dateStr) {
    requireAuthorizedUser_();
    // Credit Invoices/Customer Payments are deliberately not fetched any more
    // -- they're no longer part of the Sales report (see
    // CREDIT_AND_CUSTOMER_PAYMENTS_DISABLED_FROM in Utils.gs).
    const result = {
        otherExpenses: 0,
        cashDeposit: 0,
        supplierPayments: null,
        errors: [],
    };

    try {
        result.supplierPayments = getDaftraSupplierPayments(dateStr);
    } catch (e) {
        result.errors.push("Supplier Payments: " + e.message);
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
    requireAuthorizedUser_();
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
    requireAuthorizedUser_();
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
    requireAuthorizedUser_();
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

// Run manually from the editor: logs the raw journals response for one
// day, then what getDaftraSupplierPayments() makes of it, so the
// auto-filled Payments field can be checked against Daftra's own Supplier
// Payments screen and the P&L Sales row (column E) for that date.
function testDaftraSupplierPayments() {
    requireAuthorizedUser_();
    // A day already closed in the P&L, to compare against column E.
    const TEST_DATE = "2026-09-10";

    Logger.log(
        "--- Raw journals.json (page 1, first 2 rows) for " +
            TEST_DATE +
            " ---",
    );
    try {
        const raw = daftraGet_("journals.json", {
            entity_type: "purchase_order_payment",
            date_from: TEST_DATE,
            date_to: TEST_DATE,
            limit: 2,
        });
        Logger.log(JSON.stringify(raw, null, 2).slice(0, 8000));
    } catch (e) {
        Logger.log("Raw fetch failed: " + e.message);
    }

    Logger.log("--- getDaftraSupplierPayments(" + TEST_DATE + ") ---");
    const result = getDaftraSupplierPayments(TEST_DATE);
    Logger.log(
        `${result.count} payments, total ${result.total}, ${result.flaggedCount} flagged`,
    );
    Logger.log("Expression: " + result.expression);
    result.payments.forEach((p) =>
        Logger.log(
            `#${p.code} id=${p.paymentId} ${p.amount} ${p.supplier} [${p.treasuryName}]` +
                (p.note ? " NOTE: " + p.note : ""),
        ),
    );
}
