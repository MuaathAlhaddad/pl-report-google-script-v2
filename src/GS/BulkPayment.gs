// Hands back the Bulk Payment page's markup/styles/logic for the client to
// inject on first visit -- see JS/bulkPayment.js's header comment for why
// this isn't just baked into the initial page.
function getBulkPaymentBundle() {
    return {
        html: include("bulkPayment.html"),
        css: include("bulkPayment.css"),
        js: include("bulkPayment-script.html"),
    };
}

// Reuses the same client picker data as the Bulk Invoice tool
// (searchDaftraClients() lives in BulkInvoice.gs).
function getBulkPaymentInitData() {
    return {
        clients: searchDaftraClients(),
        treasuries: searchDaftraTreasuries(),
    };
}

// "treasuries.json" is an educated guess at the endpoint name (matching the
// plural-noun.json convention every other Daftra list endpoint here uses),
// NOT confirmed against this account -- if it's wrong, this just throws and
// the UI falls back to a plain numeric Treasury ID field instead of a
// dropdown, so a bad guess degrades gracefully rather than breaking the
// page. Run testDaftraTreasuries() from the editor to check the raw
// response and confirm/fix the field names below.
function searchDaftraTreasuries() {
    try {
        return fetchDaftraLookupList_("treasuries.json", "Treasury", (t) => ({
            id: Number(t.id),
            name: t.name || t.treasury_name || t.title || "Treasury #" + t.id,
        }));
    } catch (e) {
        return [];
    }
}

// Records one client payment per row, same date, same payment method/
// treasury, different clients/amounts -- money credited straight to each
// client's account balance (not applied to a specific invoice; Daftra
// handles that itself). Doesn't stop on the first failure -- each row
// succeeds or fails on its own, so one bad client ID doesn't lose the rest
// of the batch. rows: [{ clientId, clientName, amount }]
function createBulkClientPayments(dateStr, paymentMethod, treasuryId, rows) {
    return rows.map((row) => {
        try {
            const amount = Number(row.amount) || 0;

            const payment = createDaftraClientPayment_(
                row.clientId,
                amount,
                dateStr,
                "",
                paymentMethod,
                treasuryId,
            );

            logDailyEntry_("Payment", row.clientName, amount, true, `#${payment.id}`);

            return {
                clientName: row.clientName,
                success: true,
                paymentId: payment.id,
                verified: payment.verified,
            };
        } catch (e) {
            logDailyEntry_("Payment", row.clientName, row.amount, false, e.message);

            return {
                clientName: row.clientName,
                success: false,
                error: e.message,
            };
        }
    });
}
