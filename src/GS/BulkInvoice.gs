// Hands back the Bulk Invoice page's markup/styles/logic for the client to
// inject on first visit -- same lazy-bundle pattern as the Debts page, see
// JS/debts.js's header comment for why this isn't just baked into the
// initial page.
function getBulkInvoiceBundle() {
    return {
        html: include("bulkInvoice.html"),
        css: include("bulkInvoice.css"),
        js: include("bulkInvoice-script.html"),
    };
}

// Every "customer owes us money" sale gets recorded in Daftra as a due
// invoice against this one fixed service, instead of itemizing the real
// products -- see [[business_daily_workflow]]. This tool only ever creates
// invoices against this one service, so there's no product picker.
//
// Confirmed by the owner directly from the product's own page
// (https://muaath20002024.daftra.com/owner/products/view/1615) -- id 1615.
// Looking it up by this known id instead of matching on name is much more
// reliable than the earlier name-search approach, which failed silently
// because the guessed name field in products.json didn't match this
// account's actual response shape.
const DUE_INVOICE_SERVICE_ID = 1615;
const DUE_INVOICE_SERVICE_NAME = "فاتورة مستحقة";

// Clients + the resolved due-invoice service, fetched together once per
// page load.
function getBulkInvoiceInitData() {
    return {
        clients: searchDaftraClients(),
        service: findDueInvoiceService_(),
    };
}

// Fetches DUE_INVOICE_SERVICE_ID directly for its price. Even if this single
// -product lookup fails for some reason (network hiccup, unexpected response
// shape), we already KNOW the real id from the owner -- fall back to using
// it directly with a 0 price (editable in the UI) rather than giving up and
// sending a plain line item with no product_id at all.
function findDueInvoiceService_() {
    try {
        const payload = daftraGet_(`products/${DUE_INVOICE_SERVICE_ID}.json`);
        const product = daftraUnwrap_(payload, "Product") || payload;

        return {
            id: DUE_INVOICE_SERVICE_ID,
            name: product.name || product.product_name || DUE_INVOICE_SERVICE_NAME,
            price:
                Number(
                    product.price ||
                        product.unit_price ||
                        product.purchase_price ||
                        product.selling_price,
                ) || 0,
        };
    } catch (e) {
        return {
            id: DUE_INVOICE_SERVICE_ID,
            name: DUE_INVOICE_SERVICE_NAME,
            price: 0,
        };
    }
}

// Daftra's list endpoints paginate, and there's no confirmed server-side
// name-search filter param for clients, so instead of guessing one wrong, a
// few pages are pulled up front and the client searches through them in the
// browser. Bump these if a real account has more than ~500 clients and the
// picker starts missing results.
const BULK_INVOICE_LOOKUP_PAGES = 5;
const BULK_INVOICE_LOOKUP_PAGE_SIZE = 100;

// Field names here are guesses cross-checked against Daftra's API docs and
// third-party client libraries, NOT confirmed against this account -- see
// testDaftraProductsAndClients() in Daftra.gs to sanity-check before relying
// on this in the UI.
function searchDaftraProducts() {
    return fetchDaftraLookupList_("products.json", "Product", (p) => ({
        // Daftra's JSON sometimes comes back with numeric-looking fields as
        // strings (confirmed elsewhere, e.g. invoice payment_status) --
        // force this to a real number since the client picker's dropdown
        // embeds it as a bare literal in an inline onclick, and a
        // string/number mismatch there breaks strict-equality lookups
        // silently (this is exactly what broke client selection).
        id: Number(p.id),
        name: p.name || p.product_name || p.title || "Product #" + p.id,
        price:
            Number(
                p.price || p.unit_price || p.purchase_price || p.selling_price,
            ) || 0,
    }));
}

function searchDaftraClients() {
    return fetchDaftraLookupList_("clients.json", "Client", (c) => ({
        id: Number(c.id),
        name:
            c.business_name ||
            c.client_business_name ||
            [
                c.first_name || c.client_first_name,
                c.last_name || c.client_last_name,
            ]
                .filter(Boolean)
                .join(" ") ||
            "Client #" + c.id,
        // Needed on the invoice payload itself for any client whose Daftra
        // "invoicing method" is set to Email -- confirmed 2026-08-24,
        // Daftra rejects the invoice with a client_email validation error
        // otherwise, even though the client already has an email on file.
        email: c.email || c.client_email || "",
    }));
}

function fetchDaftraLookupList_(path, unwrapKey, mapFn) {
    const results = [];

    for (let page = 1; page <= BULK_INVOICE_LOOKUP_PAGES; page++) {
        const payload = daftraGet_(path, {
            page,
            limit: BULK_INVOICE_LOOKUP_PAGE_SIZE,
        });

        const items = daftraExtractList_(payload).map((item) =>
            daftraUnwrap_(item, unwrapKey),
        );

        if (items.length === 0) break;

        items.forEach((item) => results.push(mapFn(item)));

        const pagination = payload && payload.pagination;
        const pageCount = pagination && Number(pagination.page_count);

        if (!pageCount || page >= pageCount) break;
    }

    return results;
}

// Creates one due invoice per row against DUE_INVOICE_SERVICE_NAME, same
// date, different clients/amounts. Doesn't stop on the first failure --
// each row succeeds or fails on its own, so one bad client ID doesn't lose
// the rest of the batch. These are always unpaid (that's the point of a due
// invoice) -- no payment is ever attached. rows: [{ clientId, clientName,
// clientEmail, amount }]
function createBulkSalesInvoices(dateStr, rows) {
    const service = findDueInvoiceService_();

    return rows.map((row) => {
        try {
            const amount = Number(row.amount) || 0;

            const invoiceFields = {
                client_id: row.clientId,
                date: dateStr,
                issue_date: dateStr,
                draft: 0,
            };

            // Only clients whose Daftra "invoicing method" is Email actually
            // require this -- harmless to include whenever we have it.
            if (row.clientEmail) invoiceFields.client_email = row.clientEmail;

            const item = {
                item: service.name,
                quantity: 1,
                unit_price: amount,
            };
            if (service.id) item.product_id = service.id;

            const invoice = createDaftraInvoice_(invoiceFields, [item], null);

            return {
                clientName: row.clientName,
                success: true,
                invoiceId: invoice.id,
                invoiceNo: invoice.no,
            };
        } catch (e) {
            return {
                clientName: row.clientName,
                success: false,
                error: e.message,
            };
        }
    });
}
